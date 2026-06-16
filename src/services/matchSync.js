const axios = require('axios');
const prisma = require('../lib/prisma');
const PointsCalculatorService = require('./pointsCalculator');

const API_URL = 'https://worldcup26.ir/get/games';

/**
 * Parsea el campo de goleadores que llega como literal de array de Postgres
 * dentro de un string, p. ej.: {"Nestory Irankunda 27'","C. Metcalfe 75'"}
 * Maneja "null", comillas rectas y comillas tipográficas (“ ”).
 */
function parseScorers(raw) {
  if (!raw || raw === 'null' || raw === 'NULL') return [];
  let s = String(raw).trim();
  if (s.startsWith('{')) s = s.slice(1);
  if (s.endsWith('}')) s = s.slice(0, -1);
  if (!s.trim()) return [];
  const quoted = s.match(/[“"]([^”"]*)[”"]/g);
  if (quoted) {
    return quoted.map((m) => m.replace(/^[“"]|[”"]$/g, '').trim()).filter(Boolean);
  }
  return s.split(',').map((x) => x.replace(/["“”]/g, '').trim()).filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class MatchSyncService {
  /**
   * Descarga los partidos con timeout y reintentos (la API externa falla
   * a veces). Devuelve el array de games o null si no se pudo tras N intentos.
   */
  static async fetchGames(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(API_URL, { timeout: 15000 });
        const { games } = response.data || {};
        if (Array.isArray(games)) return games;
        console.error('Invalid data format from games API');
        return null;
      } catch (error) {
        console.warn(
          `Games API fetch failed (attempt ${attempt}/${retries}): ${error.message}`
        );
        if (attempt < retries) await sleep(2000 * attempt); // backoff
      }
    }
    return null;
  }

  /**
   * Fetches matches from the external API and updates the local database.
   */
  static async syncMatches() {
    try {
      const games = await this.fetchGames();
      if (!games) {
        console.warn('Skipping sync: no se pudo obtener la lista de partidos.');
        return;
      }

      for (const game of games) {
        // Find existing match
        const existingMatch = await prisma.match.findUnique({
          where: { id: game.id }
        });

        // Estado: finished / live / notstarted (según la API externa).
        const status =
          game.finished === 'TRUE'
            ? 'finished'
            : game.time_elapsed === 'live'
            ? 'live'
            : 'notstarted';
        const homeScore = game.home_score !== null && game.home_score !== "null" ? parseInt(game.home_score) : null;
        const awayScore = game.away_score !== null && game.away_score !== "null" ? parseInt(game.away_score) : null;
        const matchDate = new Date(game.local_date); // Assuming local_date is parseable e.g. "06/13/2026 21:00"
        const homeScorers = parseScorers(game.home_scorers);
        const awayScorers = parseScorers(game.away_scorers);

        if (existingMatch) {
          // Update match
          await prisma.match.update({
            where: { id: game.id },
            data: {
              status,
              homeScore,
              awayScore,
              homeScorers,
              awayScorers,
              homeTeamNameEn: game.home_team_name_en,
              awayTeamNameEn: game.away_team_name_en,
              homeTeamNameFa: game.home_team_name_fa,
              awayTeamNameFa: game.away_team_name_fa,
            }
          });

          // If the match just finished, calculate points!
          if (existingMatch.status !== 'finished' && status === 'finished') {
            console.log(`Match ${game.id} finished. Calculating points...`);
            await PointsCalculatorService.updatePredictionsForMatch(game.id, homeScore, awayScore);
          }

        } else {
          // Create new match
          await prisma.match.create({
            data: {
              id: game.id,
              homeTeamId: game.home_team_id,
              awayTeamId: game.away_team_id,
              homeTeamNameEn: game.home_team_name_en,
              awayTeamNameEn: game.away_team_name_en,
              homeTeamNameFa: game.home_team_name_fa,
              awayTeamNameFa: game.away_team_name_fa,
              matchDate,
              status,
              homeScore,
              awayScore,
              homeScorers,
              awayScorers
            }
          });
        }
      }

      console.log('Match synchronization complete.');

    } catch (error) {
      console.error('Error syncing matches:', error.message);
    }
  }

  /**
   * Sincroniza solo si la última fue hace más de `maxAgeMs` (throttle).
   * Deduplica syncs concurrentes. Pensado para "sync-on-read" en serverless,
   * para mantener frescos los partidos en vivo sin saturar la API externa.
   */
  static async syncIfStale(maxAgeMs = 30000) {
    const now = Date.now();
    if (MatchSyncService._inFlight) return MatchSyncService._inFlight;
    if (now - (MatchSyncService._lastSync || 0) < maxAgeMs) return;

    // Marca el throttle al inicio: aunque la sync sea lenta o la corte Vercel,
    // no se re-dispara en cada request durante `maxAgeMs`.
    MatchSyncService._lastSync = now;
    MatchSyncService._inFlight = (async () => {
      try {
        await MatchSyncService.syncMatches();
      } finally {
        MatchSyncService._inFlight = null;
      }
    })();
    return MatchSyncService._inFlight;
  }
}

MatchSyncService._lastSync = 0;
MatchSyncService._inFlight = null;

module.exports = MatchSyncService;
