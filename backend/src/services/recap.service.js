/**
 * Le bilan du lundi matin.
 *
 * Le rappel du vendredi sert a faire jouer. Celui-ci sert a faire revenir, et
 * ce n'est pas la meme chose : il ne demande rien. Il raconte le week-end.
 *
 * Pourquoi ca compte, a cinq joueurs. Le classement general se fige vite —
 * trois journees suffisent a installer un ordre qui ne bouge plus beaucoup — et
 * un jeu dont le resultat est previsible cesse d'etre suivi. Le vainqueur de la
 * journee, lui, change presque chaque semaine : c'est ce qui donne a chacun
 * quelque chose a gagner, et quelque chose a raconter le lundi.
 *
 * Quatre elements, et pas un de plus :
 *   - le vainqueur du week-end, qui est le titre du mail ;
 *   - le classement general avec les places gagnees et perdues, qui est ce qui
 *     pousse a ouvrir le site pour verifier ;
 *   - un fait marquant, choisi automatiquement, qui est ce qui fait qu'on lit
 *     le mail au lieu de le parcourir ;
 *   - une ligne sur la prochaine journee, pour fermer sur une action.
 *
 * La derniere est deliberement courte : le rappel du vendredi fait deja ce
 * travail, et deux courriels qui disent la meme chose s'annulent.
 */

const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');
const journal = require('./job-log.service');
const desinscription = require('./desinscription.service');
const series = require('./series.service');
const { stats, classer, retenuAuClassement } = require('./ranking');

const prisma = new PrismaClient();

const KIND = 'RECAP_JOURNEE';
const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

/**
 * Au-dela de combien de jours une sauvegarde manquante est une anomalie.
 *
 * Elles passent le samedi et le lundi : le plus grand intervalle normal est de
 * cinq jours, du lundi au samedi. A huit, un tour a forcement ete manque.
 */
const SAUVEGARDE_SEUIL_JOURS = 8;

const dateFr = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/**
 * La journee a raconter : la derniere dont **toutes** les rencontres sont
 * terminees.
 *
 * « Toutes » est le mot important. Prendre la derniere journee ayant au moins
 * un resultat enverrait le bilan le lundi d'une journee etalee sur deux
 * week-ends, ou pire, partirait avec six matchs sur sept si la LNR tarde a
 * publier le dernier. Un bilan incomplet est pire que pas de bilan : il annonce
 * un vainqueur qui n'en est pas un.
 */
async function journeeAraconter() {
  const matchs = await prisma.match.findMany({
    where: { season: SEASON },
    select: { round: true, status: true },
  });
  if (!matchs.length) return null;

  const parRonde = new Map();
  for (const m of matchs) {
    if (!parRonde.has(m.round)) parRonde.set(m.round, { total: 0, finis: 0 });
    const r = parRonde.get(m.round);
    r.total++;
    if (m.status === 'FINISHED') r.finis++;
  }

  const completes = [...parRonde.entries()]
    .filter(([, r]) => r.total > 0 && r.finis === r.total)
    .map(([round]) => round);

  return completes.length ? Math.max(...completes) : null;
}

/** Points d'un joueur sur une plage de journees. */
function totalSur(pronos, filtre) {
  return pronos.filter(filtre).reduce((s, p) => s + (p.points || 0), 0);
}

/**
 * Tout ce qu'il faut dire, calcule une fois pour tout le monde.
 *
 * Le classement est etabli deux fois : avec la journee et sans elle. La
 * difference des rangs donne les places gagnees et perdues — qu'on ne peut pas
 * deduire autrement, puisque la base ne garde aucun historique du classement.
 */
async function bilan(round) {
  /**
   * Les joueurs en pause ne figurent pas au bilan.
   *
   * Ni dans le tableau, ni parmi les destinataires, et c'est la meme decision :
   * quelqu'un qui a dit ne plus jouer n'a pas a occuper une ligne du classement
   * de la semaine. Ses pronostics et ses points restent en base, intacts ; il
   * suffit qu'il reprenne pour qu'ils reviennent.
   */
  const users = await prisma.user.findMany({
    where: { enPause: false },
    orderBy: { id: 'asc' },
  });

  const pronos = await prisma.prediction.findMany({
    where: { match: { season: SEASON, status: 'FINISHED' } },
    include: {
      match: { include: { homeTeam: true, awayTeam: true } },
      user: { select: { id: true, username: true } },
    },
  });

  const parJoueur = new Map(users.map((u) => [u.id, []]));
  for (const p of pronos) if (parJoueur.has(p.userId)) parJoueur.get(p.userId).push(p);

  /**
   * Le departage passe par `ranking`, la meme fonction que le site.
   *
   * C'est la seule facon de garantir que le mail et la page rendent le meme
   * ordre. Mon premier jet triait ici par points puis par ordre alphabetique,
   * alors que le site triait par points puis par scores exacts : sur la J3 de
   * cette saison les deux regles donnaient le meme premier par coincidence, et
   * la coincidence n'allait pas tenir.
   *
   * Chaque joueur est donc decrit deux fois — avec la journee et sans elle —
   * et classe deux fois par la meme fonction. La difference des rangs donne les
   * places gagnees et perdues, que la base ne garde nulle part.
   */
  // Meme filtre que le site : les journees anterieures au seuil ne comptent pas
  // au cumul. Sans cela le mail annoncerait un total et un rang que la page
  // contredirait.
  const ligne = (u, pronos) => ({
    id: u.id, username: u.username, email: u.email, mailBilan: u.mailBilan,
    ...stats(pronos.filter(retenuAuClassement)),
  });

  const apres = classer(users.map((u) => ligne(u, parJoueur.get(u.id) || [])));
  const avant = classer(users.map((u) => ligne(u, (parJoueur.get(u.id) || []).filter((p) => p.match.round < round))));

  const rangAvant = new Map(avant.map((l) => [l.id, l.rank]));

  const classement = apres.map((l) => ({
    ...l,
    rang: l.rank,
    total: l.points,
    journee: totalSur(parJoueur.get(l.id) || [], (p) => p.match.round === round),
    // Un rang qui diminue est une progression : on inverse pour que le signe se
    // lise comme on l'attend, « +1 » voulant dire une place gagnee.
    mouvement: rangAvant.get(l.id) - l.rank,
  }));

  const lignes = classement;
  const meilleurs = [...lignes].sort((a, b) => b.journee - a.journee || a.username.localeCompare(b.username));
  const top = meilleurs[0]?.journee ?? 0;
  // Une egalite en tete se dit, elle ne se tranche pas en silence.
  const vainqueurs = meilleurs.filter((l) => l.journee === top && top > 0);

  /**
   * La serie de journees gagnees, calculee par le meme service que le site.
   *
   * Le bilan et la page doivent dire la meme chose des memes chiffres. La
   * recalculer ici, avec les pronostics deja charges plus haut, serait plus
   * rapide d'une requete et strictement equivalent — jusqu'au jour ou l'une des
   * deux versions evoluerait sans l'autre. On a deja paye ce prix-la sur le
   * departage.
   */
  const parSerie = await series.pourTous({ season: SEASON });
  const commente = classement.map((l) => ({ ...l, serie: parSerie.get(l.id) || null }));

  return {
    round,
    classement: commente,
    vainqueurs,
    fait: faitMarquant(pronos.filter((p) => p.match.round === round)),
  };
}

/**
 * Le fait marquant de la journee.
 *
 * Trois candidats, par ordre de rarete decroissante : un score exact, une
 * rencontre ou tout le monde s'est trompe, le plus gros gain sur un match. On
 * prend le premier qui se presente, et rien s'il n'y a rien — une rubrique
 * remplie de force avec une banalite se demasque en deux semaines et n'est
 * plus lue.
 */
function faitMarquant(pronos) {
  if (!pronos.length) return null;
  const nom = (m) => `${m.homeTeam.shortName} – ${m.awayTeam.shortName}`;
  const score = (m) => `${m.homeScore}–${m.awayScore}`;

  const exact = pronos.find((p) => (p.basePoints ?? p.points) === 3);
  if (exact) {
    return `<b>${exact.user.username}</b> a trouvé le score exact de ${nom(exact.match)} ` +
           `(${score(exact.match)}). C'est le genre de chose qui n'arrive pas deux fois dans une saison.`;
  }

  const parMatch = new Map();
  for (const p of pronos) {
    if (!parMatch.has(p.matchId)) parMatch.set(p.matchId, []);
    parMatch.get(p.matchId).push(p);
  }
  for (const [, ps] of parMatch) {
    if (ps.length >= 3 && ps.every((p) => (p.points || 0) === 0)) {
      return `Personne n'a vu venir ${nom(ps[0].match)} (${score(ps[0].match)}) : ` +
             `les ${ps.length} pronostics sont tombés à côté.`;
    }
  }

  const gros = [...pronos].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
  if (gros && (gros.points || 0) >= 2) {
    const j = gros.joker ? ', joker posé dessus' : '';
    return `Le meilleur coup de la journée : <b>${gros.user.username}</b> sur ${nom(gros.match)} ` +
           `(${score(gros.match)}), ${gros.points} points${j}.`;
  }
  return null;
}

/** La prochaine rencontre a venir, pour fermer le mail sur une action. */
async function prochaineJournee(now = new Date()) {
  const m = await prisma.match.findFirst({
    where: { season: SEASON, status: 'SCHEDULED', kickoff: { gt: now } },
    orderBy: { kickoff: 'asc' },
    include: { homeTeam: true, awayTeam: true },
  });
  return m || null;
}

/**
 * L'etat des sauvegardes, en une phrase.
 *
 * Ce que cette phrase affirme exactement : la derniere fois que la sauvegarde a
 * ete acceptee par Brevo. Pas qu'elle est arrivee dans la boite — pour le
 * savoir il faudrait interroger Brevo sur les messages delivres. C'est deja
 * l'essentiel de la panne qu'on a eue : rien ne partait, et rien ne le disait.
 *
 * Trois etats, et le troisieme est le plus utile. Aucune trace : la tache n'a
 * jamais rien enregistre. Une reussite recente : tout va bien. Un echec plus
 * recent que la derniere reussite : la tache tourne mais elle rate, ce qui
 * n'est pas du tout le meme probleme qu'une tache arretee.
 */
function etatSauvegarde(etat, now = new Date()) {
  const jours = journal.joursDepuis(etat?.lastSuccessAt, now);

  if (jours === null) {
    return {
      alerte: true,
      texte: 'Aucune sauvegarde enregistrée à ce jour. À vérifier — ' +
             'si le journal vient d\'être mis en place, la première trace arrivera samedi.',
    };
  }

  const age = jours === 0 ? "aujourd'hui" : jours === 1 ? 'hier' : `il y a ${jours} jours`;
  const rate =
    etat.lastErrorAt && new Date(etat.lastErrorAt) > new Date(etat.lastSuccessAt)
      ? ` Depuis, une tentative a échoué : ${etat.lastError}`
      : '';

  return {
    alerte: jours > SAUVEGARDE_SEUIL_JOURS || !!rate,
    texte: `Dernière sauvegarde : ${dateFr.format(new Date(etat.lastSuccessAt))} (${age}).${rate}`,
  };
}

function corps(moi, b, suivant, lien, sauvegarde) {
  const vainq = b.vainqueurs;
  const phrasesPerso = series.phrases(moi, { pourSoi: true });
  const titreVainqueur = !vainq.length
    ? `Journée ${b.round} : personne n'a marqué`
    : vainq.length === 1
    ? `${vainq[0].username} remporte la journée ${b.round}`
    : `${vainq.map((v) => v.username).join(' et ')} à égalité sur la journée ${b.round}`;

  const fleche = (n) => (n > 0 ? `▲ +${n}` : n < 0 ? `▼ ${n}` : '–');

  const tableau = b.classement
    .map((l) => {
      const gras = l.id === moi.id ? 'font-weight:700' : '';
      return `<tr style="${gras}">` +
        `<td style="padding:4px 10px 4px 0">${l.rang}</td>` +
        `<td style="padding:4px 14px 4px 0">${l.username}${l.id === moi.id ? ' (toi)' : ''}</td>` +
        `<td style="padding:4px 14px 4px 0;text-align:right;color:#14532d">+${l.journee}</td>` +
        `<td style="padding:4px 12px 4px 0;text-align:right">${l.total}</td>` +
        `<td style="padding:4px 0;text-align:right;color:#6b7280">${fleche(l.mouvement)}</td>` +
        `</tr>`;
    })
    .join('');

  const intro =
    `<b>${titreVainqueur}</b>` +
    (vainq.length ? ` avec ${vainq[0].journee} point${vainq[0].journee > 1 ? 's' : ''}.` : '.') +
    `<br><br>Toi, tu as marqué <b>${moi.journee} point${moi.journee > 1 ? 's' : ''}</b> ce week-end, ` +
    `et tu es <b>${moi.rang}${moi.rang === 1 ? 'er' : 'e'}</b> au général` +
    (moi.mouvement > 0
      ? `, en hausse de ${moi.mouvement} place${moi.mouvement > 1 ? 's' : ''}.`
      : moi.mouvement < 0
      ? `, en baisse de ${-moi.mouvement} place${-moi.mouvement > 1 ? 's' : ''}.`
      : `, sans changement.`) +
    // Ce qui est vrai pour ce lecteur-la, et pour lui seul : sa serie, son
    // ecart avec le voisin. C'est la seule partie du bilan qui differe d'un
    // destinataire a l'autre, et c'est celle qui fait ouvrir le site.
    (phrasesPerso.length ? `<br><br>${phrasesPerso.join(' ')}` : '') +
    (b.fait ? `<br><br>${b.fait}` : '') +
    // Trois colonnes de chiffres, et chacune repond a une question differente :
    // ce que la journee a rapporte, ou l'on en est, et si l'on monte ou l'on
    // descend. La derniere est celle qui fait ouvrir le site.
    `<br><br><table style="border-collapse:collapse;font-size:14px;margin-top:4px">` +
    `<tr style="color:#8a7f6d;font-size:12px;text-transform:uppercase;letter-spacing:.06em">` +
    `<td style="padding:0 10px 6px 0"></td><td style="padding:0 14px 6px 0">Joueur</td>` +
    `<td style="padding:0 14px 6px 0;text-align:right">J${b.round}</td>` +
    `<td style="padding:0 12px 6px 0;text-align:right">Total</td>` +
    `<td style="padding:0 0 6px;text-align:right">Évol.</td></tr>` +
    `${tableau}</table>` +
    (suivant
      ? `<br>Prochaine rencontre : ${suivant.homeTeam.shortName} – ${suivant.awayTeam.shortName}, ` +
        `${dateFr.format(suivant.kickoff)}.`
      : '');

  /**
   * L'etat des sauvegardes ne part qu'a celui qui les recoit.
   *
   * Les quatre autres joueurs n'ont rien a faire de la sante d'une tache
   * technique : pour eux ce serait du bruit dans un mail qui doit rester une
   * lecture de plaisir, et un bruit qu'on apprend a sauter finit par masquer le
   * reste. Le destinataire est donc identifie par `BACKUP_EMAIL_TO`, c'est-a-dire
   * exactement celui a qui les sauvegardes sont envoyees.
   */
  const gardien = (process.env.BACKUP_EMAIL_TO || '').trim().toLowerCase();
  const pourMoi = gardien && String(moi.email || '').trim().toLowerCase() === gardien;
  const etat = pourMoi ? etatSauvegarde(sauvegarde) : null;

  const pied =
    `Tu reçois ce bilan chaque lundi matin, après la dernière rencontre de la journée. ` +
    `Un seul par journée, jamais davantage.` +
    (etat ? `<br><br>${etat.alerte ? '⚠ ' : ''}${etat.texte}` : '');

  // Deux liens seulement : couper ce bilan-ci, ou tout arreter.
  const liens = desinscription.liensPour(moi.id, 'bilan');

  const texte =
    `${titreVainqueur}\n\n` +
    `Toi : ${moi.journee} point(s) ce week-end, ${moi.rang}e au general.\n` +
    (phrasesPerso.length ? `${phrasesPerso.join(' ')}\n` : '') +
    `\n` +
    b.classement.map((l) => `${l.rang}. ${l.username}  +${l.journee} ce week-end, ${l.total} pts au total (${fleche(l.mouvement)})`).join('\n') +
    (etat ? `\n\n${etat.alerte ? '/!\\ ' : ''}${etat.texte}` : '') +
    `\n\n${lien}\n` +
    mailer.piedLiensTexte(liens);

  return {
    subject: `J${b.round} — ${titreVainqueur}`,
    html: mailer.wrap(
      `Le bilan de la journée ${b.round}`,
      intro,
      'Voir le classement',
      lien,
      pied,
      liens
    ),
    text: texte,
  };
}

/**
 * `dryRun` n'ecrit rien et n'envoie rien : il rend le bilan calcule et la liste
 * des destinataires. C'est ce qui permet de verifier le contenu un mercredi,
 * sans attendre lundi et sans ecrire a personne.
 */
async function envoyerRecap({ dryRun = false, force = false, round = null } = {}) {
  const rapport = { round: null, envoyes: [], ignores: [], erreurs: [] };

  if (!mailer.isConfigured()) {
    rapport.erreurs.push('Envoi d e-mails non configure');
    return rapport;
  }

  const cible = round ?? (await journeeAraconter());
  if (!cible) {
    rapport.raison = 'Aucune journee entierement terminee';
    return rapport;
  }
  rapport.round = cible;

  const b = await bilan(cible);
  rapport.bilan = {
    vainqueurs: b.vainqueurs.map((v) => `${v.username} (${v.journee})`),
    fait: b.fait,
    classement: b.classement.map((l) => `${l.rang}. ${l.username} ${l.total} (${l.mouvement >= 0 ? '+' : ''}${l.mouvement})`),
  };

  const lien = `${(process.env.APP_URL || '').replace(/\/$/, '')}/classement`;
  const suivant = await prochaineJournee();

  // Lu une fois pour tout le monde, meme si un seul destinataire le verra : une
  // lecture de plus par joueur pour une information identique n'apporte rien.
  const sauvegarde = await journal.dernier(journal.TACHES.SAUVEGARDE);
  rapport.sauvegarde = etatSauvegarde(sauvegarde).texte;

  for (const moi of b.classement) {
    // Celui qui a coupe le bilan ne le recoit pas, mais reste au tableau : il
    // joue toujours, il a seulement demande qu'on ne lui ecrive plus le lundi.
    if (moi.mailBilan === false) {
      rapport.ignores.push(`${moi.username} : bilan desactive`);
      continue;
    }

    if (dryRun) {
      // La simulation rend le message reel, et pas seulement le calcul.
      //
      // Le rapport JSON dit ce que le service a trouve ; il ne dit pas ce que
      // les gens vont lire. Or c'est la seule chose qu'on ne peut plus corriger
      // une fois le courriel parti. On rend donc la version texte de chaque
      // message — le HTML serait illisible dans un terminal, et les deux
      // portent le meme contenu.
      const msg = corps(moi, b, suivant, lien, sauvegarde);
      rapport.envoyes.push(`${moi.username} (simulation)`);
      rapport.apercus = rapport.apercus || [];
      rapport.apercus.push({ pour: moi.username, sujet: msg.subject, texte: msg.text });
      continue;
    }

    // Enregistre AVANT l'envoi : c'est la base qui garantit qu'un seul bilan
    // part par joueur et par journee, et non la regularite du planificateur.
    // Un redemarrage du serveur un lundi matin ne peut donc pas produire un
    // second courriel.
    if (!force) {
      try {
        await prisma.reminder.create({ data: { userId: moi.id, round: cible, kind: KIND } });
      } catch {
        rapport.ignores.push(`${moi.username} : bilan J${cible} deja envoye`);
        continue;
      }
    }

    try {
      await mailer.send({ to: moi.email, ...corps(moi, b, suivant, lien, sauvegarde) });
      rapport.envoyes.push(moi.username);
    } catch (err) {
      rapport.erreurs.push(`${moi.username} : ${err.message}`);
    }
  }

  // Le bilan se journalise lui-meme : il est la tache dont la panne se
  // remarquerait le plus tard, puisque personne n'attend un courriel qui n'est
  // pas encore arrive.
  if (!dryRun && rapport.envoyes.length) {
    await journal.succes(journal.TACHES.BILAN, { round: cible, envoyes: rapport.envoyes.length });
  }

  return rapport;
}

module.exports = { envoyerRecap, journeeAraconter, bilan, faitMarquant, etatSauvegarde, KIND };
