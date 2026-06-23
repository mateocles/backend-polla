const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const EmailService = require('../services/emailService');

// Audiencias válidas para los ID tokens de Google (web/iOS/Android/Expo).
const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_EXPO_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client();

class AuthController {
  static async register(req, res) {
    try {
      const { email, password, name } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: { email, passwordHash, name }
      });

      res.status(201).json({ message: 'User registered successfully', userId: user.id });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });

      res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Paso 1: solicita recuperación. Genera un token de un solo uso (1h) y envía
  // un correo con el enlace a la app web. Responde 200 SIEMPRE para no revelar
  // si el email está registrado.
  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const user = await prisma.user.findUnique({ where: { email } });
      // Solo enviamos correo a usuarios con contraseña (no a cuentas solo-Google).
      if (user && user.passwordHash) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await prisma.user.update({
          where: { id: user.id },
          data: { resetToken: token, resetTokenExpiry: expiry },
        });
        await EmailService.sendPasswordReset(user.email, token);
      }

      res.json({ message: 'Si el correo existe, se enviaron instrucciones de recuperación.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Paso 2: aplica la nueva contraseña usando el token del correo.
  static async resetPassword(req, res) {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: 'Token y contraseña son requeridos' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      const user = await prisma.user.findFirst({
        where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
      });
      if (!user) {
        return res.status(400).json({ error: 'El enlace es inválido o ha expirado' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetToken: null, resetTokenExpiry: null },
      });

      res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Actualiza el perfil del usuario autenticado (nombre / avatar en base64).
  static async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const { name, avatarUrl } = req.body;

      const data = {};
      if (typeof name === 'string' && name.trim()) data.name = name.trim();
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

      const user = await prisma.user.update({ where: { id: userId }, data });
      res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Login/registro con Google vía ID token (web y móvil).
  // El cliente obtiene el idToken de Google y lo manda aquí para verificarlo.
  static async googleAuth(req, res) {
    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_AUDIENCES.length ? GOOGLE_AUDIENCES : undefined,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) return res.status(401).json({ error: 'Invalid Google token' });

      const { sub: googleId, email, name, picture } = payload;

      // Busca por email; crea la cuenta si no existe (sin contraseña).
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email, name: name || email, googleId, avatarUrl: picture || null },
        });
      } else if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      });
    } catch (error) {
      console.error('Google auth error:', error.message);
      res.status(401).json({ error: 'No se pudo verificar la cuenta de Google' });
    }
  }

  static async googleCallback(req, res) {
    // This assumes req.user is populated by passport
    if (!req.user) {
      return res.status(401).json({ error: 'Google authentication failed' });
    }

    const token = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    // Redirect to frontend or send token depending on how frontend is set up
    // Usually it redirects to frontend URL with token as query param
    res.redirect(`http://localhost:3000/auth-success?token=${token}`);
  }
}

module.exports = AuthController;
