require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const MatchSyncService = require('./services/matchSync');

const app = express();

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

// Sync matches on startup
MatchSyncService.syncMatches();

// Schedule cron job to run every 30 minutes to fetch matches
cron.schedule('*/30 * * * *', () => {
  console.log('Running scheduled match sync...');
  MatchSyncService.syncMatches();
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
