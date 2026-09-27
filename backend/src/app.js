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
const backupRoutes = require('./routes/backup.routes');
const reminderRoutes = require('./routes/reminder.routes');
const recapRoutes = require('./routes/recap.routes');

const { startResultsCron } = require('./cron/results.cron');
const { startBackupCron } = require('./cron/backup.cron');
const { startReminderCron } = require('./cron/reminder.cron');
const { startScheduleCron } = require('./cron/schedule.cron');
const { startRecapCron } = require('./cron/recap.cron');
const { startCompositionCron } = require('./cron/composition.cron');
const { startStatsCron } = require('./cron/stats.cron');

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
app.use('/api/admin/backup', backupRoutes);
app.use('/api/admin/reminders', reminderRoutes);
app.use('/api/admin/recap', recapRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serveur Top 14 Pronostics demarre sur http://localhost:${PORT}`);

  // Taches automatiques : resultats et classement, sauvegarde, rappels du
  // vendredi, horaires et diffuseurs, bilan du lundi.
  //
  // Chacune annonce son activation dans les journaux au demarrage. C'est le
  // moyen le plus simple de verifier qu'une tache est bien branchee : une ligne
  // manquante au demarrage veut dire que l'appel a ete oublie ici, et c'est
  // exactement ce qui nous a fait chercher les rappels du vendredi.
  startResultsCron();
  startBackupCron();
  startReminderCron();
  startScheduleCron();
  startRecapCron();
  startCompositionCron();
  startStatsCron();
});

module.exports = app;
