/**
 * Les compositions des rencontres a venir, relues sur la LNR.
 *
 * A quoi ca sert. Un pronostic se decide souvent sur le quinze annonce : un
 * buteur sur le banc, un pilier titulaire absent, une equipe remaniee avant une
 * coupe d'Europe. La LNR publie les compositions le jeudi ou le vendredi, donc
 * en plein dans la fenetre ou les joueurs pronostiquent — a condition qu'on
 * aille les chercher.
 *
 * Pourquoi encore un service. Comme les horaires, les compositions regardent
 * l'avenir, et comme eux elles **bougent** : une equipe annoncee le jeudi est
 * corrigee le vendredi, parfois le samedi matin. Il faut donc relire, et relire
 * n'a de sens que sur les rencontres qui n'ont pas commence. Ce service n'ecrit
 * que deux colonnes, `composition` et `compositionAt`, et jamais sur une
 * rencontre terminee : au pire il ne fait rien.
 *
 * Ce qu'il ne fait pas, volontairement. Il ne devine rien. Une page vide est le
 * cas normal du mardi, pas une panne : elle est comptee « en attente » et rien
 * n'est ecrit.
 *
 * ---------------------------------------------------------------------------
 * LES GARDE-FOUS, ET POURQUOI ILS ONT ETE RESSERRES
 * ---------------------------------------------------------------------------
 *
 * Les six premieres journees ont ete ecrites avec les deux camps intervertis
 * une fois sur deux. La cause etait dans l'analyseur — la LNR range parfois le
 * visiteur en premier et le signale par un attribut qui n'etait pas lu, voir
 * sources/lnr-compositions.js. Mais il faut regarder pourquoi ce service l'a
 * laissee passer six semaines, parce que c'est la sa part de responsabilite.
 *
 * Le controle en place etait :
 *
 *     if (lu.homeTeam && ev.home && lu.homeTeam !== ev.home) { refuser }
 *
 * Il comparait le nom du recevant annonce par la feuille a celui attendu. Ces
 * deux noms etaient justes — ils sont lus dans l'en-tete, que le defaut
 * n'affectait pas. Le controle disait donc « tout va bien » pendant que les
 * quinze changeaient de cote sous lui : il verifiait l'etiquette, pas le
 * contenu.
 *
 * Et sa premiere condition, `lu.homeTeam &&`, le desarmait entierement des que
 * ce nom manquait. Un garde-fou qui s'efface quand la donnee se degrade garde
 * exactement dans les cas ou il ne sert a rien.
 *
 * Les trois refus ci-dessous sont donc ecrits dans l'autre sens : on exige une
 * raison d'ecrire, au lieu de chercher une raison de refuser. Pas d'en-tete
 * lisible, pas d'ecriture — car sans en-tete on ignore l'ordre des blocs, donc
 * a qui appartient chaque quinze. Pas de nom de recevant, pas d'ecriture. Un
 * nom qui ne correspond pas, pas d'ecriture.
 *
 * Cout reseau : une requete par rencontre, sept par journee, quelques fois par
 * jour. On espace d'une demi-seconde par politesse envers un site qu'on lit
 * gratuitement.
 */

const { PrismaClient } = require('@prisma/client');
const lnr = require('./sources/lnr');
const compositions = require('./sources/lnr-compositions');

const prisma = new PrismaClient();

/**
 * Require tardif, pour la meme raison que dans `team-stats.service` :
 * `results-sync` deconstruit `calculatePoints` du controleur des matchs en tete
 * de fichier, et tout chemin qui ferait charger results-sync pendant que le
 * controleur se construit y laisserait `calculatePoints` a `undefined` — sans
 * erreur, et sans que les points soient plus jamais attribues.
 *
 * Ce service-ci n'est aujourd'hui appele que par son cron, donc le cycle
 * n'existe pas encore. Il existerait le jour ou un controleur voudrait une
 * composition ; autant ne pas poser le piege.
 */
const resolveTeam = (...a) => require('./results-sync.service').resolveTeam(...a);

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

/**
 * Le slug d'un club a partir de son nom, par retournement de la table de la
 * source.
 *
 * Pourquoi un slug plutot qu'un nom. Le controle d'appariement comparait les
 * libelles : « Montpellier HR » dans le calendrier, « Montpellier Hérault
 * Rugby » sur la feuille de match. Deux ecritures du meme club, et un refus
 * d'ecrire sur une feuille parfaitement correcte.
 *
 * Ajouter une table d'equivalences de noms serait une mauvaise reponse : elle
 * serait fausse au premier club qui change de denomination, et on en a deja
 * une. Le slug, lui, est un identifiant — il est dans l'adresse de la feuille
 * (`11851-montpellier-toulon`), il ne depend d'aucune orthographe, et il se
 * verifie avant meme de telecharger la page.
 */
const SLUG_PAR_NOM = Object.fromEntries(
  Object.entries(lnr.SLUG_TO_NAME).map(([slug, nom]) => [nom, slug])
);

// Combien de jours devant on va chercher. Six couvre la journee du week-end qui
// vient et le debut de la suivante ; au-dela, rien n'est publie.
const FENETRE_JOURS = Number(process.env.COMPOSITIONS_FENETRE_JOURS || 6);

// On continue a relire un peu apres le coup d'envoi : la LNR corrige parfois sa
// feuille dans le quart d'heure qui suit, et le match reste affiche.
const RETARD_MS = 30 * 60 * 1000;

const PAUSE_MS = 500;
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Les journees a relire : celles qui ont une rencontre non terminee dans la
 * fenetre. On part des rencontres de la base et non d'un compteur de journee,
 * pour que la fin de saison s'arrete d'elle-meme.
 */
async function journeesProches(fenetre = FENETRE_JOURS) {
  const maintenant = Date.now();
  const matchs = await prisma.match.findMany({
    where: {
      season: SEASON,
      status: { not: 'FINISHED' },
      kickoff: {
        gt: new Date(maintenant - RETARD_MS),
        lt: new Date(maintenant + fenetre * 86400000),
      },
    },
    select: { round: true },
    distinct: ['round'],
    orderBy: { round: 'asc' },
  });
  return matchs.map((m) => m.round);
}

/**
 * Ce qu'on garde en base. Volontairement plat : lu tel quel par le front.
 *
 * `ordre` ne sert a rien a l'affichage, et c'est voulu : il dit dans quel sens
 * la page etait ecrite le jour de la lecture. Une composition en base devient
 * ainsi verifiable sans retourner sur le site — et le defaut qui a coute six
 * journees aurait ete visible dans les donnees elles-memes.
 */
function aEcrire(lu) {
  return {
    arbitre: lu.arbitre || null,
    url: lu.url || null,
    ordre: lu.visiteurEnPremier ? 'visiteur-en-premier' : 'recevant-en-premier',
    home: lu.home,
    away: lu.away,
  };
}

/** Les numeros et noms, dans l'ordre : la signature d'une composition. */
function signature(c) {
  if (!c) return '';
  const cote = (x) =>
    [...(x?.titulaires || []), ...(x?.remplacants || [])]
      .map((j) => `${j.numero}:${j.nom}${j.capitaine ? '(c)' : ''}`)
      .join(',');
  return `${cote(c.home)}|${cote(c.away)}|${c.arbitre || ''}`;
}

/**
 * Combien de places ont change entre deux compositions. Sert au rapport, pour
 * qu'une simulation dise « 3 changements » plutot que « mise a jour » — la
 * difference entre une correction de detail et une equipe remaniee.
 *
 * La clef porte le camp **et** le numero, pas le numero seul : les deux equipes
 * alignent un 1 et un 10, et un index par numero seul les ecrase l'un l'autre.
 * Une premiere version le faisait, et annoncait donc zero changement quand le 10
 * du recevant changeait — un test l'a attrapee avant la mise en ligne.
 */
function changements(avant, apres) {
  if (!avant) return null;
  const plat = (c) =>
    new Map(
      [
        ...(c?.home?.titulaires || []).map((j) => ['h', j]),
        ...(c?.home?.remplacants || []).map((j) => ['h', j]),
        ...(c?.away?.titulaires || []).map((j) => ['a', j]),
        ...(c?.away?.remplacants || []).map((j) => ['a', j]),
      ].map(([cote, j]) => [`${cote}${j.numero}`, j.nom])
    );
  const a = plat(avant);
  const b = plat(apres);
  let n = 0;
  for (const [k, v] of b) if (a.get(k) !== v) n++;
  return n;
}

/**
 * Relit les compositions des journees proches.
 *
 * En simulation, rien n'est ecrit et le rapport dit exactement ce qui le
 * serait — y compris les quinze noms, pour qu'on puisse verifier a l'oeil qu'on
 * n'a pas interverti les deux camps.
 *
 * `inclureTerminees` n'est jamais vrai en fonctionnement normal : une rencontre
 * jouee ne change plus de composition, et la relire serait une requete pour
 * rien. Il existe pour le rattrapage des journees ecrites de travers, qui sont
 * precisement toutes terminees — voir scripts/compo-rattrapage.js. On le passe
 * explicitement, a la main, et jamais depuis un cron.
 */
async function syncCompositions({
  dryRun = false, rounds = null, verbose = false, inclureTerminees = false,
} = {}) {
  const cibles = rounds && rounds.length ? rounds : await journeesProches();
  const rapport = {
    ok: true, dryRun, rounds: cibles, sources: {},
    updated: 0, skipped: 0, enAttente: 0, refusees: 0,
    unmatched: [], notes: [], changes: [], apercus: [],
  };
  if (!cibles.length) {
    rapport.reason = 'Aucune rencontre a venir dans la fenetre';
    return rapport;
  }

  const teams = await prisma.team.findMany();

  for (const round of cibles) {
    let events;
    try {
      events = (await lnr.fetchRound(round)).map(lnr.normalize);
      rapport.sources[`lnr J${round}`] = `${events.length} rencontres`;
    } catch (err) {
      // Le garde-fou de la source a parle : on journalise fort et on passe. Ne
      // rien ecrire est toujours preferable a ecrire a moitie, et se taire est
      // ce qui avait laisse le classement fige quatre jours.
      rapport.ok = false;
      rapport.sources[`lnr J${round}`] = `ECHEC — ${err.message}`;
      console.error(`[compositions] LNR J${round} : ${err.message}`);
      continue;
    }

    for (const ev of events) {
      if (!ev.sheetPath) { rapport.skipped++; continue; }

      /*
       * Refus 0 — l'adresse de la feuille ne nomme pas les deux clubs attendus.
       *
       * Le controle le plus sur, et le moins cher : il se fait sur une chaine
       * de caracteres, avant toute requete reseau. Si l'adresse associee a
       * Perpignan–Vannes parle de Bordeaux, l'appariement est faux et aucune
       * lecture ne pourra le rattraper.
       *
       * On ne refuse que si les deux slugs sont connus : un club absent de la
       * table serait deja signale ailleurs, et ce controle ne doit pas devenir
       * un second endroit ou la maintenir.
       */
      const slugH = SLUG_PAR_NOM[ev.home];
      const slugA = SLUG_PAR_NOM[ev.away];
      if (slugH && slugA && !(ev.sheetPath.includes(slugH) && ev.sheetPath.includes(slugA))) {
        rapport.ok = false;
        rapport.refusees++;
        rapport.unmatched.push(
          `J${round} ${ev.home}–${ev.away} : la feuille « ${ev.sheetPath.split('/').pop()} » ` +
          `ne nomme pas ces deux clubs — rien ecrit`
        );
        continue;
      }

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

      // Une rencontre jouee ne change plus de composition : ce qui est en base
      // est definitif, et une requete de plus n'apprendrait rien. Sauf quand on
      // repare ce qui a ete ecrit de travers, d'ou l'echappatoire explicite.
      if (match.status === 'FINISHED' && !inclureTerminees) { rapport.skipped++; continue; }

      let lu;
      try {
        lu = await compositions.fetchCompositions(ev.sheetPath);
      } catch (err) {
        rapport.ok = false;
        rapport.unmatched.push(`J${round} ${ev.home}–${ev.away} : lecture impossible (${err.message})`);
        console.error(`[compositions] ${ev.home}–${ev.away} : ${err.message}`);
        continue;
      } finally {
        await dors(PAUSE_MS);
      }

      /*
       * Refus 1 — l'en-tete n'a pas ete lu.
       *
       * C'est lui qui porte `visiting-first`, donc l'ordre des deux blocs. Sans
       * lui, les quinze sont peut-etre complets mais on ignore a qui les
       * attribuer. Une composition qu'on ne sait pas ranger ne vaut rien, et
       * c'est exactement l'erreur qu'on repare : mieux vaut un manque visible.
       */
      if (!lu.ordreConnu) {
        rapport.ok = false;
        rapport.refusees++;
        rapport.unmatched.push(
          `J${round} ${ev.home}–${ev.away} : en-tete <line-up-pitch> illisible — ordre des camps inconnu, rien ecrit`
        );
        console.error(`[compositions] ${ev.home}–${ev.away} : en-tete illisible`);
        continue;
      }

      // Le mardi, la feuille existe et n'annonce personne. Ce n'est pas une
      // panne, c'est le calendrier.
      if (!lu.complete) { rapport.enAttente++; continue; }

      /*
       * Refus 2 — la feuille ne nomme pas son recevant.
       *
       * L'ancienne version passait outre (`if (lu.homeTeam && ...)`), ce qui
       * revenait a se fier le plus a la donnee la plus degradee.
       */
      if (!lu.homeTeam) {
        rapport.ok = false;
        rapport.refusees++;
        rapport.unmatched.push(`J${round} ${ev.home}–${ev.away} : la feuille n'annonce aucun recevant — rien ecrit`);
        continue;
      }

      /*
       * Le nom du recevant : une note, plus un refus.
       *
       * Ce controle refusait d'ecrire quand le nom annonce par la feuille
       * differait de celui attendu. Il a bloque une feuille parfaitement
       * correcte, la LNR ecrivant « Montpellier Hérault Rugby » sur la feuille
       * et « Montpellier HR » au calendrier.
       *
       * Un libelle est editorial : il s'ecrit en long ici, en court la, et
       * change le jour d'un changement de denomination. L'appariement est donc
       * verifie plus haut, sur les slugs, qui sont des identifiants. Ce qui
       * reste ici est une note au rapport : une divergence de nom n'empeche
       * rien, mais elle merite d'etre vue — c'est souvent le premier signe
       * qu'une table de correspondance a vieilli.
       */
      if (ev.home && lu.homeTeam !== ev.home) {
        rapport.notes.push(
          `J${round} ${ev.home}–${ev.away} : la feuille ecrit « ${lu.homeTeam} » la ou nous ecrivons « ${ev.home} »`
        );
      }

      const neuf = aEcrire(lu);
      if (signature(match.composition) === signature(neuf)) { rapport.skipped++; continue; }

      const n = changements(match.composition, neuf);
      rapport.changes.push(
        `J${round} ${ev.home}–${ev.away} : ` +
          (n === null ? 'composition publiee' : `${n} changement${n > 1 ? 's' : ''}`) +
          ` (${neuf.home.titulaires.length}+${neuf.home.remplacants.length} / ` +
          `${neuf.away.titulaires.length}+${neuf.away.remplacants.length})` +
          (lu.visiteurEnPremier ? ' [visiteur ecrit en premier]' : '')
      );

      if (verbose || dryRun) {
        rapport.apercus.push({
          match: `${ev.home} – ${ev.away}`,
          arbitre: neuf.arbitre,
          ordre: neuf.ordre,
          home: neuf.home.titulaires.map((j) => `${j.numero} ${j.nom}${j.capitaine ? ' (cap.)' : ''}`),
          away: neuf.away.titulaires.map((j) => `${j.numero} ${j.nom}${j.capitaine ? ' (cap.)' : ''}`),
        });
      }

      if (!dryRun) {
        await prisma.match.update({
          where: { id: match.id },
          data: { composition: neuf, compositionAt: new Date() },
        });
      }
      rapport.updated++;
    }
  }

  if (rapport.unmatched.length) console.warn('[compositions] non traites :', rapport.unmatched);
  if (rapport.notes.length) console.warn('[compositions] a noter :', rapport.notes);
  console.log(
    `[compositions] ${dryRun ? '(simulation) ' : ''}J${cibles.join(', J')} : ` +
      `${rapport.updated} ecrite(s), ${rapport.skipped} inchangee(s), ` +
      `${rapport.enAttente} en attente, ${rapport.refusees} refusee(s)`
  );
  return rapport;
}

module.exports = { syncCompositions, journeesProches, signature, changements, aEcrire };
