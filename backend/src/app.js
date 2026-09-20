require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const matchRoutes = require('./routes/match.routes');
const predictionRoutes = require('./routes/prediction.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const syncRoutes = require('./routes/sync.routes');
const standingsRoutes = require('./routes/standings.routes');
const messageRoutes = require('./routes/message.routes');
const userRoutes = require('./routes/user.routes');
const { startResultsCron } = require('./cron/results.cron');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
// 1 Mo au lieu des 100 ko par defaut : la photo de profil arrive en data URL
// dans le corps de la requete. Le navigateur envoie environ 6 ko, la marge
// couvre un navigateur qui ne saurait pas encoder en webp.
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

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
