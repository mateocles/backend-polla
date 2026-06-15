const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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
