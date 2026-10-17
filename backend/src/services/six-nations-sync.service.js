/**
 * Le Tournoi des Six Nations, recopié en base depuis le site officiel.
 *
 * ---------------------------------------------------------------------------
 * CE QUE FAIT CE SERVICE
 * ---------------------------------------------------------------------------
 *
 * Trois choses, dans l'ordre, et chacune ne fait que compléter :
 *
 *   1. Les six nations existent dans la table des équipes. Elles y entrent
 *      comme des clubs, avec leur code à trois lettres en guise de `shortName`
 *      — les codes mêmes du site du Tournoi, qui ne recoupent aucun club.
 *
 *   2. Les quinze rencontres de l'édition existent, avec leur journée, leur
 *      coup d'envoi et leur stade. Le coup d'envoi suit le site tant que la
 *      rencontre n'est pas jouée : un horaire avancé d'une heure doit l'être ici
 *      aussi, puisque c'est lui qui ferme les pronostics.
 *
 *   3. Un score définitif est enregistré, et les points attribués.
 *
 * Il n'efface jamais rien, et ne touche jamais une rencontre terminée.
 *
 * ---------------------------------------------------------------------------
 * LA JOURNÉE N'EST PAS DANS LA PAGE
 * ---------------------------------------------------------------------------
 *
 * Le site range ses rencontres par date, pas par journée. On la reconstitue :
 * les quinze matchs se jouent en cinq week-ends de trois, séparés d'au moins
 * une semaine. Une nouvelle journée commence donc après tout écart de plus de
 * quatre jours entre deux coups d'envoi.
 *
 * Et on le vérifie au lieu de le supposer : cinq journées de trois matchs, sans
 * quoi rien n'est écrit. Un Tournoi qui se jouerait un jour sur deux week-ends
 * collés ferait échouer la passe bruyamment, ce qui vaut mieux qu'une journée 6
 * inventée en silence.
 *
 * ---------------------------------------------------------------------------
 * CE QU'IL NE FAIT PAS ENCORE
 * ---------------------------------------------------------------------------
 *
 * Les scores en cours de match ne sont pas recopiés : seul un score définitif
 * l'est. Afficher le score en direct serait agréable, l'attribuer ne le serait
 * pas, et la première version ne fait que ce qui compte.
 *
 * ---------------------------------------------------------------------------
 * L'AFFICHE DE CHAQUE JOURNÉE
 * ---------------------------------------------------------------------------
 *
 * Même règle que le championnat : le match qui commence le plus tard, figé au
 * premier coup d'envoi de la journée. Le service des horaires du Top 14 la
 * marque pour ses journées ; celui-ci la marque pour les siennes, à chaque
 * passe, tant que la journée n'a pas commencé.
 */

const { PrismaClient } = require('@prisma/client');
const source = require('./sources/six-nations');
const { SIX_NATIONS } = require('./competitions');
const { afficheDeLaJournee, journeeCommencee } = require('./rules');

const prisma = new PrismaClient();

/**
 * Require tardif, pour la même raison que dans composition-sync : charger le
 * contrôleur des matchs pendant qu'il se construit laisserait `calculatePoints`
 * à `undefined` — sans erreur, et sans que les points soient jamais attribués.
 */
const calculatePoints = (...a) => require('../controllers/match.controller').calculatePoints(...a);
const { majClassement } = require('./six-nations-classement.service');

/** L'édition en cours : le Tournoi qui se joue au printemps qui vient. */
const ANNEE = Number(process.env.SIX_NATIONS_ANNEE || 2027);

/**
 * Les nations, en base.
 *
 * Deux codes par nation, qui ne servent pas à la même chose :
 *
 *  - `code` est celui du site du Tournoi. Il sert à lire la page et à former
 *    l'identifiant des rencontres (`6N-2027-IRE-ENG`), qui ne doit jamais
 *    changer ;
 *  - `shortName` est celui qu'on lit dans l'appli, en français : « ANG » et
 *    « GAL » plutôt que « ENG » et « WAL », dans l'en-tête des colonnes de
 *    Résultats comme sur les écussons.
 *
 * Les nations ont d'abord été créées sous le code du site. `assurerNations` les
 * renomme d'elle-même au passage suivant : aucune requête à lancer à la main.
 */
const NATIONS = [
  { code: 'FRA', shortName: 'FRA', name: 'France' },
  { code: 'ENG', shortName: 'ANG', name: 'Angleterre' },
  { code: 'IRE', shortName: 'IRL', name: 'Irlande' },
  { code: 'SCO', shortName: 'ECO', name: 'Écosse' },
  { code: 'WAL', shortName: 'GAL', name: 'Pays de Galles' },
  { code: 'ITA', shortName: 'ITA', name: 'Italie' },
];

/** Au-delà de quatre jours entre deux coups d'envoi, une nouvelle journée commence. */
const ECART_JOURNEE_MS = 4 * 86400000;

/** L'identifiant d'une rencontre : l'édition et l'affiche, qui ne se répète pas. */
const identifiant = (annee, home, away) => `6N-${annee}-${home}-${away}`;

/**
 * Les six nations en base, rangées par le code du site.
 *
 * Créées si elles manquent. Une nation déjà là est reconnue à son code
 * français, à l'ancien code du site ou à son nom ; si son code n'est pas le
 * code français, il est corrigé. Le nom, lui, n'est jamais réécrit : un nom
 * corrigé à la main ne doit pas être écrasé à chaque passage.
 */
async function assurerNations({ dryRun = false } = {}) {
  const codes = [...new Set(NATIONS.flatMap((n) => [n.code, n.shortName]))];
  const existantes = await prisma.team.findMany({
    where: {
      OR: [
        { shortName: { in: codes } },
        { name: { in: NATIONS.map((n) => n.name) } },
      ],
    },
  });

  const parCode = new Map();
  const creees = [];
  const renommees = [];

  for (const n of NATIONS) {
    const t =
      existantes.find((x) => x.shortName === n.shortName) ||
      existantes.find((x) => x.shortName === n.code) ||
      existantes.find((x) => x.name === n.name);

    if (!t) {
      if (!dryRun) {
        parCode.set(n.code, await prisma.team.create({ data: { name: n.name, shortName: n.shortName } }));
      }
      creees.push(n.name);
      continue;
    }

    if (t.shortName !== n.shortName) {
      renommees.push(`${n.name} : ${t.shortName} → ${n.shortName}`);
      parCode.set(
        n.code,
        dryRun ? t : await prisma.team.update({ where: { id: t.id }, data: { shortName: n.shortName } }),
      );
      continue;
    }

    parCode.set(n.code, t);
  }
  return { parCode, creees, renommees };
}

/**
 * Les journées, reconstituées à partir des dates.
 *
 * On trie par coup d'envoi — ou, pour une rencontre jouée dont la page ne donne
 * plus l'heure, par jour — et l'on ouvre une journée à chaque grand écart.
 */
function numeroterJournees(matchs) {
  const quand = (m) => (m.kickoff ? m.kickoff.getTime() : Date.parse(`${m.jour}T12:00:00Z`));
  const tries = [...matchs].sort((a, b) => quand(a) - quand(b));

  let journee = 0;
  let precedent = null;
  for (const m of tries) {
    const t = quand(m);
    if (precedent === null || t - precedent > ECART_JOURNEE_MS) journee++;
    m.round = journee;
    precedent = t;
  }

  // Cinq journées de trois rencontres, ou rien.
  const parJournee = {};
  for (const m of tries) parJournee[m.round] = (parJournee[m.round] || 0) + 1;
  const comptes = Object.values(parJournee);
  if (comptes.length !== 5 || comptes.some((n) => n !== 3)) {
    throw new Error(
      `Tournoi ${tries[0]?.annee ?? ''} : découpage en journées inattendu ` +
        `(${comptes.join(' + ')} rencontres) — rien n'a été écrit`
    );
  }
  return tries;
}

/**
 * Une passe complète. En simulation, rien n'est écrit et le rapport dit ce qui
 * l'aurait été.
 */
async function syncSixNations({ annee = ANNEE, dryRun = false } = {}) {
  const rapport = {
    ok: true, dryRun, annee,
    nations: [], renommees: [], crees: [], modifies: [], scores: [], refuses: [], inchanges: 0,
    affiches: [], classement: null,
  };

  const lu = await source.fetchSeason(annee);
  const matchs = numeroterJournees(lu.matchs);

  const { parCode, creees, renommees } = await assurerNations({ dryRun });
  rapport.nations = creees;
  rapport.renommees = renommees;

  // Les rencontres signalées par l'analyseur — ordre domicile/extérieur
  // contredit par le stade — ne sont pas écrites. Une affiche inversée
  // fausserait chaque pronostic posé dessus.
  const suspectes = new Set(
    lu.anomalies
      .map((a) => /([A-Z]{3})–([A-Z]{3})/.exec(a))
      .filter(Boolean)
      .map((m) => `${m[1]}-${m[2]}`)
  );

  for (const m of matchs) {
    const libelle = `J${m.round} ${m.home}–${m.away}`;

    if (suspectes.has(`${m.home}-${m.away}`)) {
      rapport.ok = false;
      rapport.refuses.push(`${libelle} : ordre des équipes contredit par le stade — rien écrit`);
      continue;
    }

    const home = parCode.get(m.home);
    const away = parCode.get(m.away);
    if (!dryRun && (!home || !away)) {
      rapport.ok = false;
      rapport.refuses.push(`${libelle} : nation inconnue en base`);
      continue;
    }

    const externalId = identifiant(annee, m.home, m.away);
    const existant = await prisma.match.findUnique({ where: { externalId } });

    // --- Création ---------------------------------------------------------
    if (!existant) {
      if (!m.kickoff) {
        // Une rencontre déjà jouée, que la page ne date plus qu'au jour : on ne
        // crée pas un match avec une heure inventée.
        rapport.refuses.push(`${libelle} : pas d'heure de coup d'envoi, rencontre non créée`);
        continue;
      }
      if (!dryRun) {
        await prisma.match.create({
          data: {
            externalId,
            competition: SIX_NATIONS,
            season: String(annee),
            round: m.round,
            homeTeamId: home.id,
            awayTeamId: away.id,
            kickoff: m.kickoff,
            venue: m.stade,
          },
        });
      }
      rapport.crees.push(`${libelle} · ${m.kickoff.toISOString().slice(0, 16)} · ${m.stade || '?'}`);
      continue;
    }

    // --- Une rencontre terminée ne bouge plus -------------------------------
    if (existant.status === 'FINISHED') { rapport.inchanges++; continue; }

    // --- Horaire, stade, journée -------------------------------------------
    const data = {};
    if (m.kickoff && existant.kickoff.getTime() !== m.kickoff.getTime()) data.kickoff = m.kickoff;
    if (m.stade && existant.venue !== m.stade) data.venue = m.stade;
    if (existant.round !== m.round) data.round = m.round;

    // --- Score définitif ----------------------------------------------------
    if (m.termine) {
      data.homeScore = m.homeScore;
      data.awayScore = m.awayScore;
      data.status = 'FINISHED';
    }

    if (!Object.keys(data).length) { rapport.inchanges++; continue; }

    if (!dryRun) {
      const maj = await prisma.match.update({ where: { id: existant.id }, data });
      if (data.status === 'FINISHED') await calculatePoints(maj);
    }

    if (data.status === 'FINISHED') {
      rapport.scores.push(`${libelle} : ${m.homeScore}–${m.awayScore}`);
    } else {
      rapport.modifies.push(`${libelle} : ${Object.keys(data).join(', ')}`);
    }
  }

  // Les affiches, une fois les rencontres à jour : un horaire déplacé dans
  // cette passe peut changer celle d'une journée qui n'a pas encore commencé.
  const journees = [...new Set(matchs.map((m) => m.round))];
  for (const round of journees) {
    const ligne = await marquerAffiche(annee, round, { dryRun });
    if (ligne) rapport.affiches.push(ligne);
  }

  /*
   * Le classement, recalculé quand il le faut : à la première passe (il
   * n'existe pas encore), après un nouveau score, ou tant qu'il compte moins
   * de rencontres que la base n'en connaît de terminées — ce qui arrive quand
   * une feuille de match n'était pas encore complète au passage précédent.
   *
   * Un échec ici n'arrête pas la passe : les horaires et les scores sont déjà
   * écrits, et ils comptent davantage. Il est dit dans le rapport, et la page
   * Championnat signale le retard.
   */
  if (!dryRun) {
    try {
      const snap = await prisma.leagueTable.findUnique({ where: { season: String(annee) } });
      const comptees = Math.round((snap?.data || []).reduce((t, r) => t + (r.played || 0), 0) / 2);
      const termines = await prisma.match.count({
        where: { competition: SIX_NATIONS, season: String(annee), status: 'FINISHED' },
      });
      if (!snap || rapport.scores.length || comptees < termines) {
        const c = await majClassement({ annee, lu });
        rapport.classement = `recalculé sur ${c.matchs} rencontre(s)`;
      }
    } catch (err) {
      rapport.ok = false;
      rapport.classement = `ÉCHEC — ${err.message}`;
      console.error('[tournoi] classement :', err.message);
    }
  }

  console.log(
    `[tournoi] ${dryRun ? '(simulation) ' : ''}${annee} : ` +
      `${rapport.crees.length} créé(s), ${rapport.modifies.length} modifié(s), ` +
      `${rapport.scores.length} score(s), ${rapport.refuses.length} refusé(s), ${rapport.inchanges} inchangé(s)`
  );
  if (rapport.refuses.length) console.warn('[tournoi] refus :', rapport.refuses);
  return rapport;
}

/**
 * Marque l'affiche d'une journée du Tournoi, si elle doit changer.
 *
 * Rend une ligne de rapport quand quelque chose change (ou changerait, en
 * simulation), `null` sinon. Une journée commencée n'est plus touchée : on ne
 * déplace pas l'affiche après que des joueurs ont posé leur joker en
 * conséquence.
 */
async function marquerAffiche(annee, round, { dryRun = false } = {}) {
  const where = { competition: SIX_NATIONS, season: String(annee), round };
  const matchs = await prisma.match.findMany({
    where,
    select: {
      id: true, kickoff: true, featured: true,
      homeTeam: { select: { shortName: true } },
      awayTeam: { select: { shortName: true } },
    },
  });
  if (!matchs.length || journeeCommencee(matchs)) return null;

  const voulue = afficheDeLaJournee(matchs);
  if (!voulue) return null;
  const actuelle = matchs.find((m) => m.featured);
  if (actuelle && actuelle.id === voulue.id) return null;

  if (!dryRun) {
    await prisma.$transaction([
      prisma.match.updateMany({ where: { ...where, featured: true }, data: { featured: false } }),
      prisma.match.update({ where: { id: voulue.id }, data: { featured: true } }),
    ]);
  }
  return `J${round} ${voulue.homeTeam.shortName}–${voulue.awayTeam.shortName}`;
}

/**
 * Le Tournoi est-il en cours ?
 *
 * De deux jours avant le premier coup d'envoi à deux jours après le dernier, la
 * passe tourne toutes les heures ; le reste de l'année, une fois par jour
 * suffit à suivre un horaire déplacé. On lit les dates en base plutôt que de
 * les écrire ici : elles changent chaque année, et la base les connaît.
 */
async function tournoiEnCours(maintenant = new Date(), annee = ANNEE) {
  const bornes = await prisma.match.aggregate({
    where: { competition: SIX_NATIONS, season: String(annee) },
    _min: { kickoff: true },
    _max: { kickoff: true },
  });
  if (!bornes._min.kickoff) return false;
  const debut = bornes._min.kickoff.getTime() - 2 * 86400000;
  const fin = bornes._max.kickoff.getTime() + 2 * 86400000;
  return maintenant.getTime() >= debut && maintenant.getTime() <= fin;
}

module.exports = {
  syncSixNations, tournoiEnCours, assurerNations, numeroterJournees, marquerAffiche,
  NATIONS, ANNEE, identifiant,
};
