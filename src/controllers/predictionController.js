const prisma = require('../lib/prisma');
const MatchSyncService = require('../services/matchSync');

// Espera la sync como máximo `ms`; si tarda más, seguimos con lo que haya en DB
// (la sync continúa en segundo plano para la próxima lectura).
function syncWithCap(ms = 3000) {
  return Promise.race([
    MatchSyncService.syncIfStale().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

// ¿Hay partidos en vivo o que debieron empezar en las últimas 3h y aún no
// figuran como finalizados? En ese caso conviene esperar la sync completa
// (en serverless el trabajo "en segundo plano" se congela al responder).
async function hasActiveMatches() {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const count = await prisma.match.count({
    where: {
      status: { not: 'finished' },
      OR: [{ status: 'live' }, { matchDate: { lte: new Date(), gte: threeHoursAgo } }],
    },
  });
  return count > 0;
}

class PredictionController {
  static async getMatchesWithPredictions(req, res) {
    try {
      const userId = req.user.userId;

      // Con partidos en vivo / recién empezados esperamos la sync completa
      // (ahora solo escribe lo que cambió, así que es rápida) para no perder
      // resultados por la congelación serverless. En reposo, refresco ligero
      // con tope de 1,5s para priorizar el tiempo de carga.
      if (await hasActiveMatches()) {
        await MatchSyncService.syncIfStale().catch(() => {});
      } else {
        await syncWithCap(1500);
      }

      // Get all matches
      const matches = await prisma.match.findMany({
        orderBy: { matchDate: 'asc' }
      });

      // Get user's predictions
      const predictions = await prisma.prediction.findMany({
        where: { userId }
      });

      // Merge
      const predictionMap = predictions.reduce((acc, p) => {
        acc[p.matchId] = p;
        return acc;
      }, {});

      const result = matches.map(m => ({
        ...m,
        prediction: predictionMap[m.id] || null
      }));

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async submitPrediction(req, res) {
    try {
      const { matchId, homeScore, awayScore } = req.body;
      const userId = req.user.userId;

      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) return res.status(404).json({ error: 'Match not found' });

      // Rule: cannot change prediction after match has started
      // We assume if status is 'notstarted' and date is in the future, it's valid
      // or if it's strictly before the matchDate.
      if (match.status !== 'notstarted' || new Date() >= match.matchDate) {
        return res.status(400).json({ error: 'Match has already started or finished' });
      }

      // Upsert prediction
      const prediction = await prisma.prediction.upsert({
        where: {
          userId_matchId: { userId, matchId }
        },
        update: {
          homeScore,
          awayScore
        },
        create: {
          userId,
          matchId,
          homeScore,
          awayScore,
          points: 0
        }
      });

      res.json(prediction);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getLeaderboard(req, res) {
    try {
      const { groupId } = req.params;

      // Refresca puntos si hay partidos recién finalizados; máx 3s de espera.
      await syncWithCap(3000);

      // Verify group exists
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            include: {
              user: {
                include: {
                  predictions: true
                }
              }
            }
          }
        }
      });

      if (!group) return res.status(404).json({ error: 'Group not found' });

      // Calculate total points for each member in this group
      const leaderboard = group.members.map(member => {
        const totalPoints = member.user.predictions.reduce((sum, p) => sum + p.points, 0);
        return {
          userId: member.user.id,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
          totalPoints
        };
      });

      // Sort descending
      leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

      res.json(leaderboard);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Pronósticos de OTRO usuario dentro de un grupo compartido.
  // Reglas: solicitante y objetivo deben pertenecer al grupo, y solo se
  // revelan predicciones de partidos ya iniciados/finalizados (anti-trampa).
  static async getUserPredictionsInGroup(req, res) {
    try {
      const requesterId = req.user.userId;
      const { userId, groupId } = req.params;

      // Ambos deben ser miembros del grupo.
      const memberships = await prisma.userGroup.findMany({
        where: { groupId, userId: { in: [requesterId, userId] } },
      });
      const ids = new Set(memberships.map((m) => m.userId));
      if (!ids.has(requesterId) || !ids.has(userId)) {
        return res.status(403).json({ error: 'No compartes este grupo con el usuario' });
      }

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) return res.status(404).json({ error: 'User not found' });

      const matches = await prisma.match.findMany({ orderBy: { matchDate: 'asc' } });
      const predictions = await prisma.prediction.findMany({ where: { userId } });
      const predMap = predictions.reduce((acc, p) => ({ ...acc, [p.matchId]: p }), {});

      const now = new Date();
      const result = matches
        // Solo partidos cerrados (ya iniciados o finalizados).
        .filter((m) => m.status !== 'notstarted' || now >= m.matchDate)
        .map((m) => ({ ...m, prediction: predMap[m.id] || null }));

      res.json({
        user: { id: target.id, name: target.name, avatarUrl: target.avatarUrl },
        matches: result,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = PredictionController;
