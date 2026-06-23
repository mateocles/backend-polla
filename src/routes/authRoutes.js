const express = require('express');
const passport = require('../lib/passport');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/google', AuthController.googleAuth);
router.patch('/profile', authenticateToken, AuthController.updateProfile);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  AuthController.googleCallback
);

module.exports = router;
