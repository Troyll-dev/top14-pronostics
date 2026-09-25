/**
 * Rappels du vendredi.
 *
 * Dans un jeu entre amis, l'oubli est le premier tueur de participation — loin
 * devant tout le reste. Quelqu'un qui n'a pas pose ses pronos n'a pas perdu
 * l'envie de jouer, il n'y a simplement pas pense le bon jour. Un courriel le
 * vendredi soir suffit a regler ca, et rend le jeu independant du fait que
 * chacun y songe de lui-meme.
 *
 * Trois precautions, parce qu'un rappel mal calibre agace plus qu'il n'aide :
 *   - on n'ecrit qu'a ceux a qui il manque vraiment quelque chose ;
 *   - on n'ecrit qu'une fois par journee et par personne, garanti par la base
 *     et non par la bonne tenue du planificateur ;
 *   - on n'ecrit pas s'il n'y a pas de match dans les jours qui viennent.
 */

const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');

const prisma = new PrismaClient();

const KIND = 'PRONOS_MANQUANTS';
const FENETRE_JOURS = 5;

const dateFr = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/**
 * La prochaine journee a pronostiquer : celle du plus petit numero parmi les
 * matchs encore a venir dans les cinq jours. On se limite a cette fenetre pour
 * ne pas relancer les gens deux semaines avant un match.
 */
async function prochaineJournee(now = new Date()) {
  const limite = new Date(now.getTime() + FENETRE_JOURS * 24 * 3600 * 1000);
  const matchs = await prisma.match.findMany({
    where: { status: 'SCHEDULED', kickoff: { gt: now, lt: limite } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });
  if (!matchs.length) return null;
  const round = matchs[0].round;
  return { round, matchs: matchs.filter((m) => m.round === round) };
}

function corps(username, round, manquants, lien) {
  const n = manquants.length;
  const liste = manquants
    .map((m) => `${m.homeTeam.shortName} – ${m.awayTeam.shortName} (${dateFr.format(m.kickoff)})`);

  const intro =
    `Salut ${username}, il te manque <b>${n} prono${n > 1 ? 's' : ''}</b> pour la journée ${round}.` +
    `<br><br>` + liste.map((l) => `· ${l}`).join('<br>');

  return {
    subject: `J${round} : il te manque ${n} prono${n > 1 ? 's' : ''}`,
    html: mailer.wrap(
      `Journée ${round} — ${n} prono${n > 1 ? 's' : ''} à poser`,
      intro,
      'Poser mes pronos',
      lien,
      `Tu reçois ce message parce qu'il te manque des pronostics avant le coup d'envoi. ` +
      `Un seul rappel par journée, jamais davantage.`
    ),
    text:
      `Salut ${username}, il te manque ${n} prono${n > 1 ? 's' : ''} pour la journee ${round}.\n\n` +
      liste.map((l) => `- ${l}`).join('\n') +
      `\n\n${lien}\n`,
  };
}

/**
 * `dryRun` n'ecrit rien et n'envoie rien : il se contente de dire qui serait
 * relance. C'est ce qui permet de verifier le comportement un mardi, sans
 * attendre vendredi et sans reveiller personne.
 */
async function envoyerRappels({ dryRun = false, force = false } = {}) {
  const rapport = { round: null, candidats: [], envoyes: [], ignores: [], erreurs: [] };

  if (!mailer.isConfigured()) {
    rapport.erreurs.push('Envoi d e-mails non configure');
    return rapport;
  }

  const journee = await prochaineJournee();
  if (!journee) {
    rapport.raison = `Aucun match programme dans les ${FENETRE_JOURS} prochains jours`;
    return rapport;
  }
  rapport.round = journee.round;

  const lien = `${(process.env.APP_URL || '').replace(/\/$/, '')}/pronostics`;
  const idsMatchs = journee.matchs.map((m) => m.id);

  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });

  for (const u of users) {
    const posees = await prisma.prediction.findMany({
      where: { userId: u.id, matchId: { in: idsMatchs } },
      select: { matchId: true },
    });
    const faits = new Set(posees.map((p) => p.matchId));
    const manquants = journee.matchs.filter((m) => !faits.has(m.id));

    if (!manquants.length) {
      rapport.ignores.push(`${u.username} : complet`);
      continue;
    }
    rapport.candidats.push(`${u.username} : ${manquants.length} manquant(s)`);
    if (dryRun) continue;

    // On enregistre AVANT d'envoyer. Si l'ecriture echoue parce que le rappel
    // existe deja, on n'envoie pas : c'est la base qui garantit l'unicite, pas
    // la regularite du planificateur. Un redemarrage du serveur un vendredi
    // soir ne peut donc pas produire un second courriel.
    if (!force) {
      try {
        await prisma.reminder.create({
          data: { userId: u.id, round: journee.round, kind: KIND },
        });
      } catch {
        rapport.ignores.push(`${u.username} : deja relance pour J${journee.round}`);
        continue;
      }
    }

    try {
      const msg = corps(u.username, journee.round, manquants, lien);
      await mailer.send({ to: u.email, ...msg });
      rapport.envoyes.push(u.username);
    } catch (err) {
      rapport.erreurs.push(`${u.username} : ${err.message}`);
    }
  }

  return rapport;
}

module.exports = { envoyerRappels, prochaineJournee, KIND };
