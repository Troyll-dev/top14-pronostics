const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TOP14_TEAMS = [
  { name: 'Stade Toulousain', shortName: 'TLS', city: 'Toulouse', logo: null },
  { name: 'Leinster', shortName: 'LEI', city: 'Dublin', logo: null },
  { name: 'Castres Olympique', shortName: 'CAO', city: 'Castres', logo: null },
  { name: 'Stade Rochelais', shortName: 'SR', city: 'La Rochelle', logo: null },
  { name: 'Racing 92', shortName: 'R92', city: 'Paris', logo: null },
  { name: 'Bordeaux-Bègles', shortName: 'UBB', city: 'Bordeaux', logo: null },
  { name: 'Clermont Auvergne', shortName: 'ASM', city: 'Clermont-Ferrand', logo: null },
  { name: 'Stade Français', shortName: 'SFP', city: 'Paris', logo: null },
  { name: 'Lyon OU', shortName: 'LOU', city: 'Lyon', logo: null },
  { name: 'Perpignan', shortName: 'USAP', city: 'Perpignan', logo: null },
  { name: 'Biarritz Olympique', shortName: 'BOI', city: 'Biarritz', logo: null },
  { name: 'Montpellier HR', shortName: 'MHR', city: 'Montpellier', logo: null },
  { name: 'Pau', shortName: 'SUA', city: 'Pau', logo: null },
  { name: 'Bayonne', shortName: 'AB', city: 'Bayonne', logo: null },
];

async function main() {
  console.log('🌱 Seed des équipes Top 14 2026-2027...');

  for (const team of TOP14_TEAMS) {
    await prisma.team.upsert({
      where: { shortName: team.shortName },
      update: {},
      create: team,
    });
  }

  console.log(`✅ ${TOP14_TEAMS.length} équipes insérées`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
