/**
 * Sauvegarde et restauration de la base.
 *
 * Pourquoi ne pas se contenter des sauvegardes de Railway. Elles existent, il
 * faut les activer, et elles sont pratiques — mais elles restent chez Railway
 * et ne se telechargent pas. Si le compte est suspendu, si l'on se trompe de
 * projet, ou simplement si l'on veut partir ailleurs, elles ne servent a rien.
 * Une sauvegarde qui ne quitte jamais l'hebergeur n'en est qu'une moitie.
 *
 * Le format est du JSON, pas un vidage SQL. C'est volontaire : on peut
 * l'ouvrir, le lire, verifier d'un coup d'oeil que les pronostics sont bien
 * dedans. Un fichier binaire qu'on n'a jamais ouvert n'inspire aucune
 * confiance — et une sauvegarde a laquelle on ne fait pas confiance ne sert a
 * rien non plus.
 */

const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const FORMAT = 1;

/**
 * Ce qu'on sauvegarde, et ce qu'on laisse.
 *
 * Les jetons de reinitialisation sont exclus : ils expirent en une heure et ne
 * contiennent que des empreintes. Les restaurer n'aurait aucun sens.
 *
 * Les photos de profil sont exclues par defaut parce qu'elles sont binaires et
 * pesent bien plus que tout le reste reuni. Elles se redeposent en trente
 * secondes ; un pronostic perdu, non. `avatars: true` les inclut si tu y tiens.
 *
 * Les empreintes de mots de passe sont exclues elles aussi, et c'est le
 * reglage par defaut : ce fichier voyage par courriel, et meme une empreinte
 * n'a rien a faire dans une boite mail. La restauration cree alors les comptes
 * avec un mot de passe inutilisable, et chacun passe par « mot de passe
 * oublie » — apres un sinistre, ce n'est pas le pire.
 *
 * `passwords: true` les inclut, pour une copie complete qu'on garde chez soi.
 */
async function exportAll({ avatars = false, passwords = false } = {}) {
  const [users, teams, matches, predictions, messages, leagueTable] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.team.findMany({ orderBy: { id: 'asc' } }),
    prisma.match.findMany({ orderBy: { id: 'asc' } }),
    prisma.prediction.findMany({ orderBy: { id: 'asc' } }),
    prisma.message.findMany({ orderBy: { id: 'asc' } }),
    prisma.leagueTable.findMany(),
  ]);

  const dump = {
    users: passwords ? users : users.map(({ password, ...reste }) => reste),
    teams, matches, predictions, messages, leagueTable,
  };

  if (avatars) {
    const rows = await prisma.userAvatar.findMany();
    dump.userAvatars = rows.map((a) => ({
      userId: a.userId,
      mimeType: a.mimeType,
      updatedAt: a.updatedAt,
      data: Buffer.from(a.data).toString('base64'),
    }));
  }

  return {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    // Trace explicite : a la restauration, on doit savoir si l'on peut rendre
    // leurs mots de passe aux joueurs ou s'il faut leur en creer un nouveau.
    passwordsIncluded: !!passwords,
    counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
    ...dump,
  };
}

/** Le meme, compresse : un fichier de 400 ko tombe sous les 40 ko. */
async function exportGzip(options) {
  const data = await exportAll(options);
  const buf = await gzip(Buffer.from(JSON.stringify(data)), { level: 9 });
  return { buf, counts: data.counts, exportedAt: data.exportedAt };
}

/**
 * Restauration.
 *
 * L'ordre compte : une table ne peut etre remplie qu'apres celles dont elle
 * depend. Equipes, puis utilisateurs, puis matchs, puis pronostics.
 *
 * On utilise `upsert` plutot que `create` pour que la restauration soit
 * rejouable : la lancer deux fois de suite donne le meme resultat que la
 * lancer une fois. C'est ce qui permet de s'en servir sans crainte quand on ne
 * sait pas exactement dans quel etat se trouve la base.
 */
async function restore(dump, { dryRun = true } = {}) {
  if (!dump || dump.format !== FORMAT) {
    throw new Error(`Format inattendu (${dump && dump.format}) — attendu ${FORMAT}`);
  }

  const plan = {
    teams: dump.teams?.length || 0,
    users: dump.users?.length || 0,
    matches: dump.matches?.length || 0,
    predictions: dump.predictions?.length || 0,
    messages: dump.messages?.length || 0,
    leagueTable: dump.leagueTable?.length || 0,
    userAvatars: dump.userAvatars?.length || 0,
  };
  if (dryRun) return { dryRun: true, plan, passwordsIncluded: !!dump.passwordsIncluded };

  const d = (x) => (x ? new Date(x) : x);
  const aReinitialiser = [];

  for (const t of dump.teams || []) {
    await prisma.team.upsert({ where: { id: t.id }, update: t, create: t });
  }
  /**
   * Les comptes. Trois cas, et le troisieme est celui qui compte.
   *
   * Si la sauvegarde contient les empreintes, on les remet telles quelles.
   * Sinon, et si le compte existe deja, on ne touche surtout pas a son mot de
   * passe : la restauration ne doit pas deconnecter quelqu'un dont le compte
   * allait bien.
   *
   * Sinon enfin — compte absent, empreinte absente — il faut bien mettre
   * quelque chose, puisque le champ est obligatoire. On y met une valeur
   * aleatoire qui n'est pas une empreinte valide : aucune comparaison ne
   * pourra jamais reussir, donc le compte existe, garde ses pronostics et son
   * historique, mais ne s'ouvre que par « mot de passe oublie ».
   */
  for (const u of dump.users || []) {
    const base = { ...u, createdAt: d(u.createdAt) };
    delete base.password;

    const existe = await prisma.user.findUnique({ where: { id: u.id } });

    if (dump.passwordsIncluded && u.password) {
      const row = { ...base, password: u.password };
      await prisma.user.upsert({ where: { id: u.id }, update: row, create: row });
    } else if (existe) {
      await prisma.user.update({ where: { id: u.id }, data: base });
    } else {
      const inutilisable = `restaure-sans-mot-de-passe:${crypto.randomBytes(24).toString('hex')}`;
      await prisma.user.create({ data: { ...base, password: inutilisable } });
      aReinitialiser.push(u.username);
    }
  }
  for (const m of dump.matches || []) {
    const row = { ...m, kickoff: d(m.kickoff), updatedAt: d(m.updatedAt) };
    await prisma.match.upsert({ where: { id: m.id }, update: row, create: row });
  }
  for (const p of dump.predictions || []) {
    const row = { ...p, createdAt: d(p.createdAt), updatedAt: d(p.updatedAt) };
    await prisma.prediction.upsert({ where: { id: p.id }, update: row, create: row });
  }
  for (const m of dump.messages || []) {
    const row = { ...m, createdAt: d(m.createdAt) };
    await prisma.message.upsert({ where: { id: m.id }, update: row, create: row });
  }
  for (const l of dump.leagueTable || []) {
    const row = { ...l, fetchedAt: d(l.fetchedAt) };
    await prisma.leagueTable.upsert({ where: { id: l.id }, update: row, create: row });
  }
  for (const a of dump.userAvatars || []) {
    const row = {
      userId: a.userId,
      mimeType: a.mimeType,
      data: Buffer.from(a.data, 'base64'),
      updatedAt: d(a.updatedAt),
    };
    await prisma.userAvatar.upsert({ where: { userId: a.userId }, update: row, create: row });
  }

  // Les identifiants ont ete imposes : les sequences Postgres, elles, sont
  // restees a leur ancienne valeur et la prochaine insertion echouerait sur un
  // doublon. On les recale sur le maximum present.
  const tables = [
    ['users', 'id'], ['teams', 'id'], ['matches', 'id'],
    ['predictions', 'id'], ['messages', 'id'], ['league_table', 'id'],
  ];
  for (const [table, col] of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', '${col}'),
              COALESCE((SELECT MAX(${col}) FROM ${table}), 1), true)`
    );
  }

  return { dryRun: false, plan, passwordsIncluded: !!dump.passwordsIncluded, aReinitialiser };
}

async function parseDump(buf) {
  const texte = buf[0] === 0x1f && buf[1] === 0x8b ? (await gunzip(buf)).toString() : buf.toString();
  return JSON.parse(texte);
}

module.exports = { exportAll, exportGzip, restore, parseDump, FORMAT };
