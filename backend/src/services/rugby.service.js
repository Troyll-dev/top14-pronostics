/**
 * Service d'import automatique des résultats Top 14
 * Utilise l'API api-rugby.p.rapidapi.com (plan gratuit : 100 req/jour)
 * Inscrivez-vous sur https://rapidapi.com/api-sports/api/api-rugby
 */
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TOP14_LEAGUE_ID = 14; // ID Top 14 sur api-rugby
const SEASON = '2026';

const apiClient = axios.create({
  baseURL: 'https://api-rugby.p.rapidapi.com',
  headers: {
    'x-rapidapi-key': process.env.RUGBY_API_KEY,
    'x-rapidapi-host': process.env.RUGBY_API_HOST || 'api-rugby.p.rapidapi.com',
  },
});

// Synchronise les résultats des matchs terminés
exports.syncResults = async () => {
  if (!process.env.RUGBY_API_KEY) {
    console.log('⚠️  RUGBY_API_KEY non configurée — sync ignorée');
    return;
  }

  const { data } = await apiClient.get('/games', {
    params: { league: TOP14_LEAGUE_ID, season: SEASON },
  });

  const games = data?.response || [];
  let updated = 0;

  for (const game of games) {
    if (game.status?.short !== 'FT') continue; // Seulement les matchs terminés

    const match = await prisma.match.findFirst({ where: { externalId: String(game.id) } });
    if (!match || match.status === 'FINISHED') continue;

    const homeScore = game.scores?.home?.total ?? null;
    const awayScore = game.scores?.away?.total ?? null;
    if (homeScore === null || awayScore === null) continue;

    await prisma.match.update({
      where: { id: match.id },
      data: { homeScore, awayScore, status: 'FINISHED' },
    });

    // Calcul des points
    await calculatePoints({ ...match, homeScore, awayScore });
    updated++;
  }

  console.log(`✅ ${updated} résultats mis à jour`);
};

// Import du calendrier depuis l'API externe
exports.syncSchedule = async () => {
  if (!process.env.RUGBY_API_KEY) return;

  const { data } = await apiClient.get('/games', {
    params: { league: TOP14_LEAGUE_ID, season: SEASON },
  });

  const games = data?.response || [];
  let created = 0;

  for (const game of games) {
    const homeTeam = await prisma.team.findFirst({
      where: { name: { contains: game.teams?.home?.name, mode: 'insensitive' } },
    });
    const awayTeam = await prisma.team.findFirst({
      where: { name: { contains: game.teams?.away?.name, mode: 'insensitive' } },
    });

    if (!homeTeam || !awayTeam) continue;

    await prisma.match.upsert({
      where: { externalId: String(game.id) },
      update: {},
      create: {
        externalId: String(game.id),
        round: game.league?.round ? parseInt(game.league.round.replace(/\D/g, '')) : 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        kickoff: new Date(game.date),
        venue: game.venue?.name,
      },
    });
    created++;
  }

  console.log(`✅ ${created} matchs importés`);
};

async function calculatePoints(match) {
  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } });
  for (const pred of predictions) {
    const predWinner = Math.sign(pred.homeScorePred - pred.awayScorePred);
    const realWinner = Math.sign(match.homeScore - match.awayScore);
    const exact = pred.homeScorePred === match.homeScore && pred.awayScorePred === match.awayScore;
    let points = 0;
    if (exact) points = 3;
    else if (predWinner === realWinner) {
      const diff = Math.abs(Math.abs(pred.homeScorePred - pred.awayScorePred) - Math.abs(match.homeScore - match.awayScore));
      points = diff <= 5 ? 2 : 1;
    }
    await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
  }
}
