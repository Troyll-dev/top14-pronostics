/**
 * La forme des clubs, telle qu'elle se deduit des matchs deja joues.
 *
 * Deux choses vivent ici, et elles sont volontairement separees.
 *
 * `syncStats` lit la page « statistiques du match » de chaque rencontre
 * terminee et l'enregistre telle quelle, une fois pour toutes. Une page de
 * match joue ne change plus : on ne la relit donc jamais, et la passe
 * quotidienne ne s'occupe que des matchs dont on n'a encore rien.
 *
 * `forme` additionne ces pages pour rendre, par club, les quelques nombres qui
 * servent vraiment a placer un score : essais marques et encaisses par match,
 * penalites concedees, plaquages manques, points pour et contre.
 *
 * Pourquoi recalculer au lieu de tenir des totaux. Un compteur qu'on incremente
 * a chaque nouveau match se desynchronise du detail des qu'une lecture est
 * rejouee, qu'un score est corrige ou qu'une page est relue — et personne ne
 * s'en apercoit, parce qu'un total faux reste plausible. Ici le detail est la
 * seule verite et le total n'est qu'une vue : il ne peut pas deriver. Sur vingt-
 * six journees ca represente cent quatre-vingt-deux lignes a additionner, ce qui
 * ne se mesure pas.
 *
 * Un point de justesse qui compte plus qu'il n'y parait : `avantRound`. Pour
 * pronostiquer la journee 5, la forme utile est celle des journees 1 a 4 — et
 * quand on rouvre la page de la journee 3 en fevrier, on veut encore voir ce
 * qu'on savait a ce moment-la, pas les chiffres de fin de saison. Le cumul
 * s'arrete donc toujours avant la journee affichee.
 *
 * Les points pour et contre ne viennent pas de la page de la LNR mais de nos
 * propres colonnes `homeScore` et `awayScore` : ce sont les memes nombres, et
 * autant les prendre a la source qui fait foi chez nous.
 */

const { PrismaClient } = require('@prisma/client');
const lnr = require('./sources/lnr');
const stats = require('./sources/lnr-stats');

const prisma = new PrismaClient();

/**
 * `resolveTeam` vit dans results-sync, et ce require est **volontairement
 * tardif**. Il ne doit pas etre en tete de fichier.
 *
 * La raison est un cycle, et le cycle est silencieux. `results-sync` recupere
 * `calculatePoints` du controleur des matchs par deconstruction, en tete de
 * fichier :
 *
 *     const { calculatePoints } = require('../controllers/match.controller');
 *
 * Or le controleur a besoin d'ici pour la forme des clubs. Charge en premier, il
 * demande ce service, qui demande results-sync, qui redemande un controleur
 * encore a moitie construit : `calculatePoints` y vaut alors `undefined`, et le
 * reste pour toujours puisqu'il a ete deconstruit. Resultat, l'attribution des
 * points apres chaque match cesse de fonctionner — sans erreur, sans message, et
 * on ne le decouvre que le lundi en voyant un classement fige.
 *
 * Demander results-sync au moment de s'en servir suffit : a cet instant tout est
 * charge. `forme` et `cumuler`, qui sont ce dont le controleur a besoin, n'en
 * dependent pas du tout.
 */
const resolveTeam = (...a) => require('./results-sync.service').resolveTeam(...a);

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

const PAUSE_MS = 500;
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Le recevant annonce par la page est-il bien celui qu'on attend ?
 *
 * Le garde-fou qui utilise cette fonction comparait deux chaines de caracteres.
 * Il a bloque trois rencontres de Montpellier depuis la premiere journee, sans
 * que rien ne le signale ailleurs que dans un journal que personne ne lit : le
 * calendrier de la LNR ecrit « Montpellier HR », sa feuille de statistiques
 * ecrit « Montpellier Herault Rugby ». Deux orthographes, un seul club, et une
 * egalite de chaines qui repond non.
 *
 * Le cout de ce non etait invisible et durable. Montpellier affichait ses
 * moyennes sur deux matchs quand les autres en avaient cinq, et ses trois
 * adversaires a l'exterieur sur quatre : une comparaison de formes faussee pour
 * huit clubs, sur une carte dont le seul objet est de comparer.
 *
 * On compare donc des identites : le nom lu sur la page passe par la meme
 * resolution que partout ailleurs dans le projet, et le resultat se confronte a
 * l'identifiant du recevant en base.
 *
 * Et quand ce nom ne se resout pas, on laisse passer en le signalant, au lieu de
 * refuser. C'est un renversement voulu : un garde-fou doit se declencher sur une
 * preuve, pas sur une ignorance. Refuser faute de reconnaitre un nom, c'est
 * exactement ce qui vient de couter cinq journees de statistiques — alors que le
 * risque qu'il couvre, une page appartenant a une autre rencontre, se manifeste
 * par un nom parfaitement reconnaissable et different.
 */
function recevantConforme(nomLu, homeTeamId, teams) {
  if (!nomLu) return { ok: true };

  const resolu = resolveTeam(nomLu, teams);
  if (!resolu) return { ok: true, inconnu: true };

  return { ok: resolu.id === homeTeamId };
}

/** Ce qu'on garde par rencontre. Toutes les barres, pas seulement celles qui servent. */
function aEcrire(lu) {
  return { url: lu.url || null, barres: lu.barres, cartons: lu.cartons };
}

const val = (m, clef, cote) => {
  const b = m?.stats?.barres?.[clef];
  const v = b ? b[cote] : null;
  return Number.isFinite(v) ? v : null;
};

/** Les compteurs nus, sans contexte. */
function compteurs() {
  return {
    matchs: 0,
    essaisPour: 0, essaisContre: 0,
    pointsPour: 0, pointsContre: 0,
    penalitesConcedees: 0, plaquagesManques: 0, cartons: 0,
    possession: 0, possessionMatchs: 0,
  };
}

/**
 * Un accumulateur vide : le total de la saison, et les deux contextes.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI SEPARER LE DOMICILE DE L'EXTERIEUR
 * ---------------------------------------------------------------------------
 *
 * Parce qu'on l'a mesure. Sur les journees jouees, le receveur l'emporte dans
 * 71 % des rencontres, et aucune strategie testee — ni les copains, ni un Elo,
 * ni le classement — ne fait mieux que de parier le receveur a chaque fois.
 * L'avantage du terrain vaut une dizaine de points, pas six : c'est ce qui a
 * fait corriger la constante de Bob.
 *
 * Or une moyenne de saison melange les deux contextes. Un club qui marque 28
 * points de moyenne peut en mettre 35 chez lui et 20 au-dehors ; la moyenne
 * globale annonce alors un match serre la ou tout dit le contraire. La carte
 * compare donc ce qui se compare : les chiffres du receveur **a domicile**
 * face a ceux du visiteur **a l'exterieur**.
 *
 * Les totaux toutes rencontres confondues restent, en tete de l'objet et sous
 * leurs noms d'origine. Bob les lit — c'est sur eux qu'il est calibre — et les
 * remplacer aurait change son comportement sans que personne ne l'ait demande.
 */
function vide() {
  return {
    ...compteurs(),
    domicile: compteurs(),
    exterieur: compteurs(),
  };
}

const moyenne = (total, n) => (n ? Math.round((total / n) * 10) / 10 : null);

/** Ferme un jeu de compteurs : ajoute les moyennes, retire les compteurs de service. */
function fermerCompteurs(a) {
  const { possession, possessionMatchs, domicile, exterieur, ...garde } = a;
  return {
    ...garde,
    essaisPourParMatch: moyenne(a.essaisPour, a.matchs),
    essaisContreParMatch: moyenne(a.essaisContre, a.matchs),
    pointsPourParMatch: moyenne(a.pointsPour, a.matchs),
    pointsContreParMatch: moyenne(a.pointsContre, a.matchs),
    penalitesParMatch: moyenne(a.penalitesConcedees, a.matchs),
    plaquagesManquesParMatch: moyenne(a.plaquagesManques, a.matchs),
    possessionMoyenne: moyenne(possession, possessionMatchs),
  };
}

/**
 * Ferme un accumulateur complet : le total, puis les deux contextes.
 *
 * La forme de sortie est volontairement additive — les champs d'origine n'ont
 * pas bouge d'un caractere, et `domicile` / `exterieur` s'ajoutent a cote. Tout
 * ce qui lisait cet objet avant continue de fonctionner sans savoir que les
 * contextes existent, Bob le premier.
 */
function fermer(a) {
  return {
    ...fermerCompteurs(a),
    domicile: fermerCompteurs(a.domicile || compteurs()),
    exterieur: fermerCompteurs(a.exterieur || compteurs()),
  };
}

/**
 * La forme de tous les clubs, par identifiant d'equipe.
 *
 * `avantRound` borne le cumul aux journees strictement anterieures. Sans borne,
 * tout ce qui est termine compte — ce qui est le bon comportement pour une vue
 * « saison ».
 */
async function forme({ season = SEASON, avantRound = null } = {}) {
  // On filtre sur `statsAt`, pas sur `stats`.
  //
  // Prisma refuse `stats: null` et `stats: { not: null }` sur une colonne Json :
  // il faut passer par `Prisma.DbNull`, parce qu'une colonne Json distingue deux
  // sortes de vide — la colonne SQL vide, et la valeur JSON `null` ecrite
  // dedans. La distinction est reelle, mais elle ne nous concerne pas : on
  // n'ecrit jamais `null` comme valeur.
  //
  // `statsAt` est une simple date, qui se filtre normalement, et qui est ecrite
  // dans le meme mouvement que `stats`. Elle repond donc exactement a la
  // question posee — « cette rencontre a-t-elle ete lue ? » — sans avoir a
  // expliquer la subtilite a chaque requete.
  const where = { season, status: 'FINISHED', statsAt: { not: null } };
  if (Number.isFinite(avantRound)) where.round = { lt: avantRound };

  const matchs = await prisma.match.findMany({
    where,
    select: {
      round: true, homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true, stats: true,
    },
  });

  return cumuler(matchs);
}

/**
 * L'addition elle-meme, separee de la requete.
 *
 * Elle prend une liste de rencontres et rend un objet : aucune base, donc
 * verifiable par un test. C'est la lecon du bareme — tant qu'une regle vit au
 * milieu d'une boucle qui lit la base, la seule facon de savoir ce qu'elle
 * calcule est de jouer une journee et de regarder apres coup.
 */
function cumuler(matchs) {
  const par = new Map();
  const pour = (id) => {
    if (!par.has(id)) par.set(id, vide());
    return par.get(id);
  };

  for (const m of matchs) {
    const domTotal = pour(m.homeTeamId);
    const extTotal = pour(m.awayTeamId);

    /*
     * Chaque rencontre est comptee deux fois pour chaque club : une fois dans
     * son total de saison, une fois dans le contexte ou elle s'est jouee. Les
     * deux lignes ci-dessous sont tout le mecanisme — le reste de la boucle ne
     * sait meme pas qu'il y a deux destinations, puisqu'il ecrit dans un objet
     * qui porte les deux.
     */
    const dom = [domTotal, domTotal.domicile];
    const ext = [extTotal, extTotal.exterieur];
    const ajoute = (cibles, champ, v) => { for (const c of cibles) c[champ] += v; };

    ajoute(dom, 'matchs', 1);
    ajoute(ext, 'matchs', 1);

    // Les scores viennent de notre base, pas de la page : meme chiffre, source
    // qui fait foi.
    if (Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore)) {
      ajoute(dom, 'pointsPour', m.homeScore);   ajoute(dom, 'pointsContre', m.awayScore);
      ajoute(ext, 'pointsPour', m.awayScore);   ajoute(ext, 'pointsContre', m.homeScore);
    }

    const eDom = val(m, stats.ESSAIS, 'home');
    const eExt = val(m, stats.ESSAIS, 'away');
    if (eDom !== null) { ajoute(dom, 'essaisPour', eDom); ajoute(ext, 'essaisContre', eDom); }
    if (eExt !== null) { ajoute(ext, 'essaisPour', eExt); ajoute(dom, 'essaisContre', eExt); }

    for (const [clef, champ] of [
      [stats.PENALITES_CONCEDEES, 'penalitesConcedees'],
      [stats.PLAQUAGES_MANQUES, 'plaquagesManques'],
    ]) {
      const a = val(m, clef, 'home');
      const b = val(m, clef, 'away');
      if (a !== null) ajoute(dom, champ, a);
      if (b !== null) ajoute(ext, champ, b);
    }

    const c = m.stats?.cartons;
    if (c) {
      ajoute(dom, 'cartons', (c.home?.jaune || 0) + (c.home?.orange || 0) + (c.home?.rouge || 0));
      ajoute(ext, 'cartons', (c.away?.jaune || 0) + (c.away?.orange || 0) + (c.away?.rouge || 0));
    }

    const pDom = val(m, stats.POSSESSION, 'home');
    const pExt = val(m, stats.POSSESSION, 'away');
    if (pDom !== null) { ajoute(dom, 'possession', pDom); ajoute(dom, 'possessionMatchs', 1); }
    if (pExt !== null) { ajoute(ext, 'possession', pExt); ajoute(ext, 'possessionMatchs', 1); }
  }

  const sortie = {};
  for (const [id, a] of par) sortie[id] = fermer(a);
  return sortie;
}

/**
 * Les cinq derniers resultats de chaque club.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI ICI, ALORS QUE LE CLASSEMENT LES CALCULE DEJA
 * ---------------------------------------------------------------------------
 *
 * `standings.service.js` produit la meme chose pour la page Championnat, mais
 * sans borne : il rend la serie d'aujourd'hui. Sur la carte d'une rencontre, la
 * serie doit s'arreter **avant** la journee affichee — sinon, en rouvrant la
 * page de la J3 en fevrier, on verrait une forme qui contient le resultat du
 * match qu'on est en train de regarder, ce qui n'a aucun sens.
 *
 * C'est la meme regle d'honnetete que pour les moyennes, et c'est pour ca que
 * la fonction vit a cote d'elles plutot que d'aller chercher celle du
 * classement.
 *
 * Elle n'exige pas `statsAt` : un resultat existe des que le score est connu,
 * meme si la feuille de statistiques n'a pas encore ete lue. Une serie ne
 * depend que du score.
 *
 * Rend, par identifiant de club, du plus recent au plus ancien :
 * `[{ res: 'V' | 'N' | 'D', round, domicile, adversaireId, pour, contre }]`
 */
async function serie({ season = SEASON, avantRound = null, combien = 5 } = {}) {
  const where = {
    season,
    status: 'FINISHED',
    homeScore: { not: null },
    awayScore: { not: null },
  };
  if (Number.isFinite(avantRound)) where.round = { lt: avantRound };

  const matchs = await prisma.match.findMany({
    where,
    select: {
      round: true, kickoff: true,
      homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
    },
    // Du plus recent au plus ancien : la premiere rencontre rencontree pour un
    // club est donc la derniere qu'il a jouee, et l'on s'arrete a cinq.
    orderBy: [{ round: 'desc' }, { kickoff: 'desc' }],
  });

  const par = {};
  const pousse = (id, ligne) => {
    if (!par[id]) par[id] = [];
    if (par[id].length < combien) par[id].push(ligne);
  };

  for (const m of matchs) {
    const ecart = m.homeScore - m.awayScore;
    const res = (pourLui) => (ecart === 0 ? 'N' : (ecart > 0) === pourLui ? 'V' : 'D');

    pousse(m.homeTeamId, {
      res: res(true), round: m.round, domicile: true,
      adversaireId: m.awayTeamId, pour: m.homeScore, contre: m.awayScore,
    });
    pousse(m.awayTeamId, {
      res: res(false), round: m.round, domicile: false,
      adversaireId: m.homeTeamId, pour: m.awayScore, contre: m.homeScore,
    });
  }

  return par;
}

/**
 * Les rencontres terminees dont on n'a pas encore les statistiques.
 *
 * L'etat, pas l'evenement. Cette liste se vide d'elle-meme et se remplit
 * d'elle-meme : une lecture qui a echoue sera retentee au passage suivant, et
 * une journee entiere ajoutee a la main sera rattrapee sans qu'on demande rien.
 * Un declencheur branche sur « le match vient de finir » ne se remet jamais de
 * son propre echec — on l'a appris sur le classement, reste fige quatre jours.
 */
async function aLire({ season = SEASON, limite = 20 } = {}) {
  return prisma.match.findMany({
    // `statsAt` et non `stats` : voir le commentaire dans `forme`.
    where: { season, status: 'FINISHED', statsAt: null },
    select: { id: true, round: true, externalId: true, homeTeamId: true, awayTeamId: true },
    orderBy: [{ round: 'desc' }, { kickoff: 'desc' }],
    take: limite,
  });
}

/**
 * Lit les statistiques des rencontres terminees qui n'en ont pas encore.
 *
 * Une seule lecture par rencontre dans toute la saison : la page d'un match joue
 * ne bouge plus. On passe donc par le calendrier de la journee pour obtenir le
 * chemin de feuille de match, puis on ne revient jamais.
 */
async function syncStats({ dryRun = false, rounds = null, limite = 20 } = {}) {
  const rapport = {
    ok: true, dryRun, rounds: [], sources: {},
    updated: 0, skipped: 0, enAttente: 0, unmatched: [], changes: [],
  };

  const manquants = rounds && rounds.length
    ? null
    : await aLire({ limite });

  const cibles = rounds && rounds.length
    ? [...new Set(rounds)]
    : [...new Set(manquants.map((m) => m.round))].sort((a, b) => a - b);

  rapport.rounds = cibles;
  if (!cibles.length) {
    rapport.reason = 'Aucune rencontre terminee sans statistiques';
    return rapport;
  }

  const teams = await prisma.team.findMany();

  for (const round of cibles) {
    let events;
    try {
      events = (await lnr.fetchRound(round)).map(lnr.normalize);
      rapport.sources[`lnr J${round}`] = `${events.length} rencontres`;
    } catch (err) {
      rapport.ok = false;
      rapport.sources[`lnr J${round}`] = `ECHEC — ${err.message}`;
      console.error(`[stats] LNR J${round} : ${err.message}`);
      continue;
    }

    for (const ev of events) {
      if (!ev.sheetPath) { rapport.skipped++; continue; }

      let match = await prisma.match.findFirst({ where: { externalId: ev.externalId } });
      if (!match) {
        const home = resolveTeam(ev.home, teams);
        const away = resolveTeam(ev.away, teams);
        if (!home || !away) {
          rapport.unmatched.push(`J${round} equipe non reconnue : ${[!home && ev.home, !away && ev.away].filter(Boolean).join(' + ')}`);
          continue;
        }
        match = await prisma.match.findFirst({
          where: { homeTeamId: home.id, awayTeamId: away.id, season: SEASON },
        });
        if (!match) {
          rapport.unmatched.push(`J${round} ${ev.home} vs ${ev.away} : absent de la base`);
          continue;
        }
      }

      // On ne lit que les matchs termines, et une seule fois chacun.
      if (match.status !== 'FINISHED') { rapport.enAttente++; continue; }
      if (match.stats) { rapport.skipped++; continue; }

      let lu;
      try {
        lu = await stats.fetchStats(ev.sheetPath);
      } catch (err) {
        rapport.ok = false;
        rapport.unmatched.push(`J${round} ${ev.home}–${ev.away} : lecture impossible (${err.message})`);
        console.error(`[stats] ${ev.home}–${ev.away} : ${err.message}`);
        continue;
      } finally {
        await dors(PAUSE_MS);
      }

      // Une page sans la moindre barre : la LNR n'a pas encore publie. On
      // repassera, puisque la liste se construit sur l'etat de la base.
      if (!lu.complete) { rapport.enAttente++; continue; }

      // Le meme garde-fou que pour les compositions : si la page annonce un
      // autre recevant que notre base, c'est l'appariement qui est faux, et des
      // essais attribues au mauvais club fausseraient la forme des deux clubs
      // a la fois.
      const recevant = recevantConforme(lu.homeTeam, match.homeTeamId, teams);
      if (!recevant.ok) {
        rapport.ok = false;
        rapport.unmatched.push(
          `J${round} ${ev.home}–${ev.away} : la page annonce « ${lu.homeTeam} » comme recevant — rien ecrit`
        );
        continue;
      }
      if (recevant.inconnu) {
        rapport.unmatched.push(
          `J${round} ${ev.home}–${ev.away} : recevant « ${lu.homeTeam} » non reconnu, lecture acceptee sans verification`
        );
      }

      const data = aEcrire(lu);
      const e = data.barres[stats.ESSAIS];
      rapport.changes.push(
        `J${round} ${ev.home}–${ev.away} : ${e.home}–${e.away} essais, ` +
        `${Object.keys(data.barres).length} statistiques`
      );

      if (!dryRun) {
        await prisma.match.update({
          where: { id: match.id },
          data: { stats: data, statsAt: new Date() },
        });
      }
      rapport.updated++;
    }
  }

  if (rapport.unmatched.length) console.warn('[stats] non traites :', rapport.unmatched);
  console.log(
    `[stats] ${dryRun ? '(simulation) ' : ''}J${cibles.join(', J')} : ` +
      `${rapport.updated} lue(s), ${rapport.skipped} deja connue(s), ${rapport.enAttente} en attente`
  );
  return rapport;
}

module.exports = {
  syncStats, forme, cumuler, serie, aLire, aEcrire,
  fermer, fermerCompteurs, compteurs, vide, moyenne, recevantConforme,
};
