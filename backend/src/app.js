require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const matchRoutes = require('./routes/match.routes');
const predictionRoutes = require('./routes/prediction.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const syncRoutes = require('./routes/sync.routes');
const standingsRoutes = require('./routes/standings.routes');
const { startResultsCron } = require('./cron/results.cron');

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
app.use('/api/sync', syncRoutes);
app.use('/api/standings', standingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serveur Top 14 Pronostics demarre sur http://localhost:${PORT}`);

  // Synchronisation automatique des resultats et du classement
  startResultsCron();
});

module.exports = app;
