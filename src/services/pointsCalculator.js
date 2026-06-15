const prisma = require('../lib/prisma');

class PointsCalculatorService {
  /**
   * Calculates points for a given prediction against the actual match result.
   * Rules:
   * 1. Exact match (homeScore and awayScore) = 6 points
   * 2. Correct result (win/draw/loss) but wrong score = 3 points
   * 3. Incorrect result = 0 points
   */
  static calculatePoints(predictedHome, predictedAway, actualHome, actualAway) {
    if (predictedHome === actualHome && predictedAway === actualAway) {
      return 6;
    }

    const predictedDiff = predictedHome - predictedAway;
    const actualDiff = actualHome - actualAway;

    // Check if result is the same (both draw, or both home win, or both away win)
    const predictedSign = Math.sign(predictedDiff);
    const actualSign = Math.sign(actualDiff);

    if (predictedSign === actualSign) {
      return 3;
    }

    return 0;
  }

  /**
   * Updates all predictions for a finished match.
   */
  static async updatePredictionsForMatch(matchId, actualHomeScore, actualAwayScore) {
    // 1. Get all predictions for this match
    const predictions = await prisma.prediction.findMany({
      where: { matchId }
    });

    // 2. Calculate and update points for each prediction
    for (const prediction of predictions) {
      const points = this.calculatePoints(
        prediction.homeScore,
        prediction.awayScore,
        actualHomeScore,
        actualAwayScore
      );

      // Only update if points changed (or if it was 0 and now isn't, though by default it's 0)
      if (prediction.points !== points) {
        await prisma.prediction.update({
          where: { id: prediction.id },
          data: { points }
        });
      }
    }
  }
}

module.exports = PointsCalculatorService;
