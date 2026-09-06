require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const authRoutes = require('./routes/auth.routes');
const matchRoutes = require('./routes/match.routes');
const predictionRoutes = require('./routes/prediction.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const { syncResults } = require('./services/rugby.service');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cron : synchronisation des résultats chaque heure (si API key configurée)
if (process.env.RUGBY_API_KEY) {
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 Sync résultats Top 14...');
    try {
      await syncResults();
    } catch (err) {
      console.error('Erreur sync:', err.message);
    }
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🏉 Serveur Top 14 Pronostics démarré sur http://localhost:${PORT}`);
});

module.exports = app;
