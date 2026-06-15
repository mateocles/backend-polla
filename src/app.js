require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const MatchSyncService = require('./services/matchSync');
const prisma = require('./lib/prisma');

const app = express();

// En Vercel cada request es una función serverless: no hay app.listen ni cron.
const IS_SERVERLESS = !!process.env.VERCEL;

app.use(cors());
// Techo de seguridad para imágenes en base64 (comprimidas en el cliente).
app.use(express.json({ limit: '30mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/predictions', predictionRoutes);

// --- Swagger (servido por CDN para que funcione también en serverless) ---
app.get('/api/swagger.json', (req, res) => res.json(swaggerSpec));
app.get('/api-docs', (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Polla API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  window.ui = SwaggerUIBundle({ url: '/api/swagger.json', dom_id: '#swagger-ui' });
</script></body></html>`);
});

// Endpoint para sincronizar partidos (lo dispara Vercel Cron o manualmente).
app.get('/api/cron/sync', async (req, res) => {
  if (process.env.CRON_SECRET && req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await MatchSyncService.syncMatches();
  res.json({ ok: true });
});

// Basic route
app.get('/', (req, res) => res.send('Polla API is running'));

// --- Arranque solo en entorno tradicional (local / VPS), NO en Vercel ---
if (!IS_SERVERLESS) {
  cron.schedule('*/30 * * * *', () => {
    console.log('Running scheduled match sync...');
    MatchSyncService.syncMatches();
  });

  const PORT = process.env.PORT || 3000;
  warmUpDatabase().finally(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    MatchSyncService.syncMatches();
  });
}

// Warm-up: Neon (free) se suspende y tarda en despertar.
async function warmUpDatabase(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connected.');
      return;
    } catch (err) {
      console.warn(`DB warm-up failed (attempt ${attempt}/${retries}): ${err.message.split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// Exportar la app para el handler serverless de Vercel.
module.exports = app;
