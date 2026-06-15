require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const MatchSyncService = require('./services/matchSync');
const prisma = require('./lib/prisma');

const app = express();

// Warm-up: Neon (free) se suspende y tarda en despertar. Conectamos con
// reintentos al arrancar para evitar que las primeras peticiones fallen.
async function warmUpDatabase(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Una query real despierta Neon de forma confiable (no solo $connect).
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connected.');
      return;
    } catch (err) {
      console.warn(`DB warm-up failed (attempt ${attempt}/${retries}): ${err.message.split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  console.warn('DB warm-up: continuará reintentando por petición.');
}

app.use(cors());
// Techo de seguridad para imágenes en base64 (las comprimimos en el cliente
// a ~250 KB; este límite solo evita fallos en casos extremos).
app.use(express.json({ limit: '30mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/predictions', predictionRoutes);

// Basic route
app.get('/', (req, res) => {
  res.send('Polla API is running');
});

// Schedule cron job to run every 30 minutes to fetch matches
cron.schedule('*/30 * * * *', () => {
  console.log('Running scheduled match sync...');
  MatchSyncService.syncMatches();
});

// Start server tras calentar la conexión a la base de datos.
const PORT = process.env.PORT || 3000;
warmUpDatabase().finally(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  // Sincronizar partidos una vez que el server está arriba.
  MatchSyncService.syncMatches();
});
