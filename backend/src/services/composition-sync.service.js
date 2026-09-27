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
 * n'est ecrit. Et il refuse d'ecrire si le camp recevant annonce par la feuille
 * de match n'est pas celui de notre base — auquel cas c'est notre appariement
 * qui est faux, et une composition inversee serait pire que pas de composition.
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

/** Ce qu'on garde en base. Volontairement plat : lu tel quel par le front. */
function aEcrire(lu) {
  return {
    arbitre: lu.arbitre || null,
    url: lu.url || null,
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
 */
async function syncCompositions({ dryRun = false, rounds = null, verbose = false } = {}) {
  const cibles = rounds && rounds.length ? rounds : await journeesProches();
  const rapport = {
    ok: true, dryRun, rounds: cibles, sources: {},
    updated: 0, skipped: 0, enAttente: 0, unmatched: [], changes: [], apercus: [],
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
      // est definitif, et une requete de plus n'apprendrait rien.
      if (match.status === 'FINISHED') { rapport.skipped++; continue; }

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

      // Le mardi, la feuille existe et n'annonce personne. Ce n'est pas une
      // panne, c'est le calendrier.
      if (!lu.complete) { rapport.enAttente++; continue; }

      // Le garde-fou qui compte. Si la feuille de match annonce un autre
      // recevant que notre base, c'est notre appariement qui est faux — et une
      // composition inversee tromperait les joueurs bien plus surement qu'une
      // absence de composition.
      if (lu.homeTeam && ev.home && lu.homeTeam !== ev.home) {
        rapport.ok = false;
        rapport.unmatched.push(
          `J${round} ${ev.home}–${ev.away} : la feuille annonce « ${lu.homeTeam} » comme recevant — rien ecrit`
        );
        continue;
      }

      const neuf = aEcrire(lu);
      if (signature(match.composition) === signature(neuf)) { rapport.skipped++; continue; }

      const n = changements(match.composition, neuf);
      rapport.changes.push(
        `J${round} ${ev.home}–${ev.away} : ` +
          (n === null ? 'composition publiee' : `${n} changement${n > 1 ? 's' : ''}`) +
          ` (${neuf.home.titulaires.length}+${neuf.home.remplacants.length} / ` +
          `${neuf.away.titulaires.length}+${neuf.away.remplacants.length})`
      );

      if (verbose || dryRun) {
        rapport.apercus.push({
          match: `${ev.home} – ${ev.away}`,
          arbitre: neuf.arbitre,
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
  console.log(
    `[compositions] ${dryRun ? '(simulation) ' : ''}J${cibles.join(', J')} : ` +
      `${rapport.updated} ecrite(s), ${rapport.skipped} inchangee(s), ${rapport.enAttente} en attente`
  );
  return rapport;
}

module.exports = { syncCompositions, journeesProches, signature, changements, aEcrire };
