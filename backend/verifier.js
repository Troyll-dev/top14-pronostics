/**
 * Etat des lieux. Ne modifie rien, n'ecrit nulle part.
 *
 *   node verifier.js
 *
 * A poser dans backend/ et a lancer depuis backend/. Il repond, dans l'ordre,
 * aux questions qu'on se pose quand quelque chose ne marche plus :
 *
 *   les donnees sont-elles la ?
 *   la base a-t-elle les nouvelles colonnes ?
 *   le code local est-il complet ?
 *   qu'est-ce que le site en ligne renvoie vraiment ?
 *
 * Chaque reponse est independante : si l'une echoue, les autres sortent quand
 * meme. Un diagnostic qui s'arrete a la premiere erreur ne diagnostique rien.
 */

const fs = require('fs');
const path = require('path');

const ok = (t) => console.log(`  OK    ${t}`);
const ko = (t) => console.log(`  ECHEC ${t}`);
const info = (t) => console.log(`        ${t}`);
const titre = (t) => console.log(`\n=== ${t} ===`);

/**
 * Sur QUELLE base travaille-t-on ?
 *
 * Premiere ligne de la sortie, et ce n'est pas un detail de confort. La premiere
 * version de ce script ne le disait pas : elle a annonce « 1 joueur, 1
 * pronostic » sur une base de developpement locale, et on a cru pendant dix
 * minutes que la production avait ete reinitialisee.
 *
 * Un diagnostic qui ne dit pas ce qu'il mesure peut affoler plus surement qu'une
 * absence de diagnostic. Le mot de passe est masque : cette sortie se colle dans
 * une conversation.
 */
function ouSommesNous() {
  const url = process.env.DATABASE_URL || '';
  if (!url) return 'DATABASE_URL absente';
  try {
    const u = new URL(url);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    return `${u.hostname}:${u.port || '5432'}${u.pathname} — ${local ? 'BASE LOCALE (developpement)' : 'base DISTANTE (production ?)'}`;
  } catch {
    return 'DATABASE_URL illisible';
  }
}

async function main() {
  require('dotenv').config();

  titre('LA BASE INTERROGEE');
  info(ouSommesNous());
  info('Tout ce qui suit concerne cette base-la, et elle seule.');

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  /* --- 1. les donnees ---------------------------------------------------- */

  titre('LES DONNEES EN BASE');

  try {
    const [users, matchs, pronos] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.prediction.count(),
    ]);
    ok(`${users} joueurs, ${matchs} rencontres, ${pronos} pronostics`);
    if (pronos === 0) ko('AUCUN pronostic en base — c\'est le point a regarder en premier');

    const parJoueur = await prisma.prediction.groupBy({
      by: ['userId'],
      _count: { _all: true },
    });
    for (const l of parJoueur) {
      const u = await prisma.user.findUnique({ where: { id: l.userId }, select: { username: true } });
      info(`${(u?.username || `#${l.userId}`).padEnd(20)} ${l._count._all} pronostics`);
    }
  } catch (err) {
    ko(`lecture impossible : ${err.message.split('\n')[0]}`);
  }

  /* --- 2. les colonnes ---------------------------------------------------- */

  titre('LES COLONNES DE LA TABLE MATCHES');

  try {
    const colonnes = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'matches'`
    );
    const noms = colonnes.map((c) => c.column_name);
    for (const attendue of ['composition', 'compositionAt', 'stats', 'statsAt', 'broadcaster', 'featured']) {
      if (noms.includes(attendue)) ok(`colonne ${attendue}`);
      else ko(`colonne ${attendue} ABSENTE de la base`);
    }
  } catch (err) {
    ko(`interrogation de la base impossible : ${err.message.split('\n')[0]}`);
    info('(si le nom de table n\'est pas « matches », ce test seul est faux, pas les autres)');
  }

  /* --- 3. ce qui a ete charge --------------------------------------------- */

  titre('CE QUI A ETE CHARGE');

  for (const [champ, libelle] of [['statsAt', 'statistiques'], ['compositionAt', 'compositions']]) {
    try {
      const n = await prisma.match.count({ where: { [champ]: { not: null } } });
      ok(`${n} rencontres avec ${libelle}`);
    } catch (err) {
      ko(`${libelle} : ${err.message.split('\n')[0]}`);
      info('(« Unknown argument » ici veut dire : npx prisma generate n\'a pas ete relance)');
    }
  }

  try {
    const snap = await prisma.leagueTable.findFirst({ orderBy: { fetchedAt: 'desc' } });
    if (!snap) ko('aucun classement enregistre');
    else {
      const lignes = Array.isArray(snap.data) ? snap.data.length : 0;
      ok(`classement : source « ${snap.source} », ${lignes} clubs, lu le ${new Date(snap.fetchedAt).toLocaleString('fr-FR')}`);
      if (snap.source !== 'lnr-classement') info('(la source attendue est « lnr-classement »)');
    }
  } catch (err) {
    ko(`classement : ${err.message.split('\n')[0]}`);
  }

  /* --- 4. le code local ---------------------------------------------------- */

  titre('LE CODE, SUR CETTE MACHINE');

  const lire = (p) => {
    try { return fs.readFileSync(path.join(process.cwd(), p), 'utf8'); } catch { return null; }
  };

  const schema = lire('src/prisma/schema.prisma');
  if (!schema) ko('src/prisma/schema.prisma introuvable — es-tu bien dans backend/ ?');
  else {
    const modeles = (schema.match(/^\s*model\s+Match\s*\{/gm) || []).length;
    if (modeles === 1) ok('un seul model Match');
    else ko(`${modeles} blocs « model Match » — il n'en faut qu'un`);
    for (const c of ['composition', 'compositionAt', 'stats', 'statsAt']) {
      if (new RegExp(`^\\s*${c}\\s`, 'm').test(schema)) ok(`schema : ${c}`);
      else ko(`schema : ${c} manquant`);
    }
  }

  const app = lire('src/app.js') || lire('app.js');
  if (!app) ko('app.js introuvable');
  else {
    for (const [motif, libelle] of [
      [/startResultsCron\s*\(\s*\)/, 'cron resultats'],
      [/startRecapCron\s*\(\s*\)/, 'cron bilan du lundi'],
      [/startCompositionCron\s*\(\s*\)/, 'cron compositions'],
      [/startStatsCron\s*\(\s*\)/, 'cron statistiques'],
    ]) {
      if (motif.test(app)) ok(`app.js : ${libelle} demarre`);
      else ko(`app.js : ${libelle} ABSENT`);
    }
  }

  for (const f of [
    'src/services/sources/lnr-classement.js',
    'src/services/sources/lnr-compositions.js',
    'src/services/sources/lnr-stats.js',
    'src/services/team-stats.service.js',
    'src/services/composition-sync.service.js',
    'src/cron/composition.cron.js',
    'src/cron/stats.cron.js',
  ]) {
    if (lire(f)) ok(`present : ${f}`);
    else ko(`MANQUANT : ${f}`);
  }

  for (const f of ['src/services/standings-compute.js', 'test/standings.test.js']) {
    if (lire(f)) info(`a supprimer, toujours la : ${f}`);
  }

  /**
   * On lit le CODE, pas les commentaires.
   *
   * La premiere version de ce test cherchait la chaine « stats: null » dans le
   * fichier entier. Le fichier corrige la contient — dans le commentaire qui
   * explique justement pourquoi on ne l'utilise plus. Le verificateur annoncait
   * donc « ancienne version » sur la version neuve.
   *
   * C'est la meme erreur que la pastille violette et que le classement fige :
   * une mesure exacte qui repond a une autre question que celle qu'on pose. On
   * retire donc les commentaires avant de chercher.
   */
  const sansCommentaires = (src) =>
    String(src)
      .replace(/\/\*[\s\S]*?\*\//g, '')   // blocs /* ... */
      .replace(/^\s*\/\/.*$/gm, '');       // lignes // ...

  const teamStats = lire('src/services/team-stats.service.js');
  if (teamStats) {
    const code = sansCommentaires(teamStats);
    const ancien = /\bstats:\s*(null|\{\s*not:\s*null)/.test(code);
    const neuf = /\bstatsAt:\s*(null|\{\s*not:\s*null)/.test(code);

    if (ancien) {
      ko('team-stats.service.js : ancienne version (filtre « stats: null »)');
      info('c\'est le fichier corrige a remplacer');
    } else if (neuf) {
      ok('team-stats.service.js : version corrigee (filtre « statsAt »)');
    } else {
      info('team-stats.service.js : aucun des deux filtres reconnu — a regarder a la main');
    }
  }

  /* --- 5. le site en ligne -------------------------------------------------- */

  titre('LE SITE EN LIGNE');

  const API = process.env.API_URL || 'https://top14-pronostics-production.up.railway.app';
  try {
    const res = await fetch(`${API}/api/matches?round=5`);
    if (!res.ok) {
      ko(`${API}/api/matches?round=5 rend ${res.status}`);
    } else {
      const m = await res.json();
      ok(`${m.length} rencontres renvoyees pour la journee 5`);
      const un = m[0] || {};
      if ('composition' in un) ok('le serveur en ligne connait les nouvelles colonnes');
      else ko('le serveur en ligne NE connait PAS les nouvelles colonnes — deploiement pas passe');
      if ('forme' in un) ok('le serveur en ligne calcule la forme des clubs');
      else info('pas de champ « forme » : normal tant que le deploiement n\'est pas passe');
    }
  } catch (err) {
    ko(`API injoignable : ${err.message}`);
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\nLe verificateur lui-meme a echoue :', err.message);
  process.exit(1);
});
