const axios = require('axios');
const prisma = require('../lib/prisma');
const PointsCalculatorService = require('./pointsCalculator');

const API_URL = 'https://worldcup26.ir/get/games';

// Fallback: API-Football (api-sports.io). El plan Free no permite `season=2026`,
// pero SÍ devuelve el Mundial consultando por fecha y filtrando league id 1.
const API_FOOTBALL_URL = 'https://v3.football.api-sports.io/fixtures';
const WORLD_CUP_LEAGUE_ID = 1;

// Normaliza nombres de selección para emparejar entre fuentes (acentos,
// puntuación y alias frecuentes que difieren entre proveedores).
function normalizeTeam(name) {
  if (!name) return '';
  let s = String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const alias = {
    'usa': 'united states',
    'united states of america': 'united states',
    'korea republic': 'south korea',
    'ir iran': 'iran',
    'china pr': 'china',
    'cote divoire': 'ivory coast',
    'czechia': 'czech republic',
  };
  return alias[s] || s;
}

// Mapea el status.short de API-Football a nuestro modelo.
function mapApiFootballStatus(short) {
  if (['FT', 'AET', 'PEN', 'WO'].includes(short)) return 'finished';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  return 'notstarted'; // NS, TBD, PST, CANC, ABD, SUSP, ...
}

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
   * Fallback: descarga los partidos del Mundial desde API-Football consultando
   * por fecha (hoy y ayer en UTC) y los empareja con los de nuestra DB por
   * nombre de selección. Solo actualiza estado y marcador (no goleadores, que
   * costarían 1 petición extra por partido). Devuelve true si actualizó algo.
   */
  static async syncFromApiFootball() {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) {
      console.warn('Fallback no disponible: falta API_FOOTBALL_KEY.');
      return false;
    }

    const fmt = (d) => d.toISOString().slice(0, 10);
    const dates = [fmt(new Date()), fmt(new Date(Date.now() - 24 * 60 * 60 * 1000))];

    const fixtures = [];
    for (const date of dates) {
      try {
        const res = await axios.get(API_FOOTBALL_URL, {
          params: { date },
          headers: { 'x-apisports-key': key },
          timeout: 15000,
        });
        const arr = res.data && res.data.response;
        if (Array.isArray(arr)) {
          fixtures.push(...arr.filter((x) => x.league && x.league.id === WORLD_CUP_LEAGUE_ID));
        }
      } catch (error) {
        console.warn(`API-Football fetch (${date}) failed: ${error.message}`);
      }
    }

    if (!fixtures.length) {
      console.warn('Fallback: sin partidos de World Cup en API-Football.');
      return false;
    }

    const existing = await prisma.match.findMany();
    const byTeams = new Map(
      existing.map((m) => [
        `${normalizeTeam(m.homeTeamNameEn)}|${normalizeTeam(m.awayTeamNameEn)}`,
        m,
      ])
    );

    const writes = [];
    const finishedNow = [];
    for (const fx of fixtures) {
      const prev = byTeams.get(
        `${normalizeTeam(fx.teams.home.name)}|${normalizeTeam(fx.teams.away.name)}`
      );
      if (!prev) continue; // no está en nuestra DB

      const status = mapApiFootballStatus(fx.fixture.status.short);
      const homeScore = fx.goals.home != null ? fx.goals.home : null;
      const awayScore = fx.goals.away != null ? fx.goals.away : null;

      if (prev.status === status && prev.homeScore === homeScore && prev.awayScore === awayScore) {
        continue;
      }

      writes.push(
        prisma.match.update({
          where: { id: prev.id },
          data: { status, homeScore, awayScore },
        })
      );
      if (prev.status !== 'finished' && status === 'finished') {
        finishedNow.push({ id: prev.id, homeScore, awayScore });
      }
    }

    if (writes.length) await Promise.all(writes);
    for (const m of finishedNow) {
      console.log(`[fallback] Match ${m.id} finished. Calculating points...`);
      await PointsCalculatorService.updatePredictionsForMatch(m.id, m.homeScore, m.awayScore);
    }
    console.log(`Fallback API-Football: ${writes.length} cambios, ${finishedNow.length} finalizados.`);
    return true;
  }

  /**
   * Fetches matches from the external API and updates the local database.
   */
  static async syncMatches() {
    try {
      const games = await this.fetchGames();
      if (!games) {
        console.warn('Fuente principal no disponible; intentando fallback API-Football...');
        await this.syncFromApiFootball().catch((e) =>
          console.error('Fallback API-Football error:', e.message)
        );
        return;
      }

      // Carga todos los partidos de una vez (evita 1 findUnique por juego).
      const existing = await prisma.match.findMany();
      const byId = new Map(existing.map((m) => [m.id, m]));

      const finishedNow = []; // partidos que pasan a 'finished' en esta sync
      const writes = []; // solo escrituras necesarias (juegos nuevos o cambiados)

      for (const game of games) {
        // Estado: finished / live / notstarted (según la API externa).
        const status =
          game.finished === 'TRUE'
            ? 'finished'
            : game.time_elapsed === 'live'
            ? 'live'
            : 'notstarted';
        const homeScore = game.home_score !== null && game.home_score !== "null" ? parseInt(game.home_score) : null;
        const awayScore = game.away_score !== null && game.away_score !== "null" ? parseInt(game.away_score) : null;
        const matchDate = new Date(game.local_date); // p. ej. "06/13/2026 21:00"
        const homeScorers = parseScorers(game.home_scorers);
        const awayScorers = parseScorers(game.away_scorers);

        const prev = byId.get(game.id);

        if (prev) {
          // Salta la escritura si nada relevante cambió (la mayoría de juegos).
          const unchanged =
            prev.status === status &&
            prev.homeScore === homeScore &&
            prev.awayScore === awayScore &&
            prev.homeTeamNameEn === game.home_team_name_en &&
            prev.awayTeamNameEn === game.away_team_name_en &&
            JSON.stringify(prev.homeScorers) === JSON.stringify(homeScorers) &&
            JSON.stringify(prev.awayScorers) === JSON.stringify(awayScorers);
          if (unchanged) continue;

          writes.push(
            prisma.match.update({
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
              },
            })
          );

          // Si acaba de terminar, recalculamos puntos tras escribir.
          if (prev.status !== 'finished' && status === 'finished') {
            finishedNow.push({ id: game.id, homeScore, awayScore });
          }
        } else {
          writes.push(
            prisma.match.create({
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
                awayScorers,
              },
            })
          );
          if (status === 'finished') {
            finishedNow.push({ id: game.id, homeScore, awayScore });
          }
        }
      }

      if (writes.length) await Promise.all(writes);

      // Recalcula puntos de los partidos recién finalizados.
      for (const m of finishedNow) {
        console.log(`Match ${m.id} finished. Calculating points...`);
        await PointsCalculatorService.updatePredictionsForMatch(m.id, m.homeScore, m.awayScore);
      }

      console.log(`Match synchronization complete. ${writes.length} cambios, ${finishedNow.length} finalizados.`);

      // Reconciliación: si la fuente principal dejó partidos que ya debieron
      // terminar (>2h desde el inicio) sin finalizar, los cierra con
      // API-Football. Solo se dispara cuando hace falta (no gasta cuota en vano).
      if (process.env.API_FOOTBALL_KEY) {
        const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const stale = await prisma.match.count({
          where: { status: { not: 'finished' }, matchDate: { lt: staleCutoff } },
        });
        if (stale > 0) {
          console.log(`${stale} partido(s) vencidos sin finalizar; reconciliando con API-Football...`);
          await this.syncFromApiFootball().catch((e) =>
            console.error('Reconcile API-Football error:', e.message)
          );
        }
      }

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
