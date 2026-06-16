const express = require('express');
const PredictionController = require('../controllers/predictionController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/matches', PredictionController.getMatchesWithPredictions);
router.post('/', PredictionController.submitPrediction);
router.get('/leaderboard/:groupId', PredictionController.getLeaderboard);
router.get('/user/:userId/group/:groupId', PredictionController.getUserPredictionsInGroup);

module.exports = router;
