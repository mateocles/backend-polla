const prisma = require('../lib/prisma');

class PredictionController {
  static async getMatchesWithPredictions(req, res) {
    try {
      const userId = req.user.userId;

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
}

module.exports = PredictionController;
