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
 * Le joker et l'affiche ne s'appliquent pas encore au Tournoi : les règles
 * actuelles ne les activent qu'à partir de la J6 du championnat. C'est à
 * corriger avant le premier pronostic du Tournoi, avec les écrans.
 */

const { PrismaClient } = require('@prisma/client');
const source = require('./sources/six-nations');
const { SIX_NATIONS } = require('./competitions');

const prisma = new PrismaClient();

/**
 * Require tardif, pour la même raison que dans composition-sync : charger le
 * contrôleur des matchs pendant qu'il se construit laisserait `calculatePoints`
 * à `undefined` — sans erreur, et sans que les points soient jamais attribués.
 */
const calculatePoints = (...a) => require('../controllers/match.controller').calculatePoints(...a);

/** L'édition en cours : le Tournoi qui se joue au printemps qui vient. */
const ANNEE = Number(process.env.SIX_NATIONS_ANNEE || 2027);

/** Les nations, en base. Le nom est celui qu'on lit en français dans l'appli. */
const NATIONS = [
  { shortName: 'FRA', name: 'France' },
  { shortName: 'ENG', name: 'Angleterre' },
  { shortName: 'IRE', name: 'Irlande' },
  { shortName: 'SCO', name: 'Écosse' },
  { shortName: 'WAL', name: 'Pays de Galles' },
  { shortName: 'ITA', name: 'Italie' },
];

/** Au-delà de quatre jours entre deux coups d'envoi, une nouvelle journée commence. */
const ECART_JOURNEE_MS = 4 * 86400000;

/** L'identifiant d'une rencontre : l'édition et l'affiche, qui ne se répète pas. */
const identifiant = (annee, home, away) => `6N-${annee}-${home}-${away}`;

/**
 * Les six nations en base. Créées si elles manquent, laissées telles quelles
 * sinon — un nom corrigé à la main ne doit pas être écrasé à chaque passage.
 */
async function assurerNations({ dryRun = false } = {}) {
  const existantes = await prisma.team.findMany({
    where: { shortName: { in: NATIONS.map((n) => n.shortName) } },
  });
  const parCode = new Map(existantes.map((t) => [t.shortName, t]));
  const creees = [];

  for (const n of NATIONS) {
    if (parCode.has(n.shortName)) continue;
    if (!dryRun) {
      const t = await prisma.team.create({ data: { name: n.name, shortName: n.shortName } });
      parCode.set(n.shortName, t);
    }
    creees.push(n.name);
  }
  return { parCode, creees };
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
    nations: [], crees: [], modifies: [], scores: [], refuses: [], inchanges: 0,
  };

  const lu = await source.fetchSeason(annee);
  const matchs = numeroterJournees(lu.matchs);

  const { parCode, creees } = await assurerNations({ dryRun });
  rapport.nations = creees;

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

  console.log(
    `[tournoi] ${dryRun ? '(simulation) ' : ''}${annee} : ` +
      `${rapport.crees.length} créé(s), ${rapport.modifies.length} modifié(s), ` +
      `${rapport.scores.length} score(s), ${rapport.refuses.length} refusé(s), ${rapport.inchanges} inchangé(s)`
  );
  if (rapport.refuses.length) console.warn('[tournoi] refus :', rapport.refuses);
  return rapport;
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
  syncSixNations, tournoiEnCours, assurerNations, numeroterJournees,
  NATIONS, ANNEE, identifiant,
};
