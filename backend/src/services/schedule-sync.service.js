/**
 * Horaires et diffuseurs des rencontres a venir.
 *
 * Pourquoi un service separe de results-sync. Celui-la ne regarde que le
 * passe : il cherche les journees dont un match a deja commence, pour aller
 * chercher un score. Or l'heure de coup d'envoi et la chaine sont des
 * informations sur l'avenir, et elles bougent — la LNR publie souvent la
 * journee avec des horaires provisoires, puis les arrete une a deux semaines
 * avant. Il faut donc une passe qui regarde devant.
 *
 * Ce service ne touche jamais aux scores ni au statut : il n'ecrit que
 * `kickoff` et `broadcaster`, et uniquement sur des rencontres non terminees.
 * Un service qui ne peut pas abimer un resultat homologue est un service
 * qu'on peut laisser tourner tous les jours sans y penser.
 *
 * L'horaire n'est pas cosmetique : c'est lui qui ferme la saisie des
 * pronostics et qui decide du passage « en cours ». Les horaires semes a la
 * main a la creation de la base etaient approximatifs — 17h00 la ou la LNR
 * annonce 14h30 — ce qui laissait pronostiquer pendant la premiere mi-temps.
 */

const { PrismaClient } = require('@prisma/client');
const lnr = require('./sources/lnr');
const { resolveTeam } = require('./results-sync.service');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

// Combien de journees a venir on relit. Trois suffisent : au-dela, la LNR
// n'a de toute facon pas encore arrete les horaires.
const MAX_ROUNDS = 3;

// En deca, on considere que c'est le meme horaire. Sans ce seuil, une seconde
// d'ecart ferait une ecriture a chaque passage.
const SEUIL_MS = 60 * 1000;

const JOUR = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' };
const affiche = (d) => new Intl.DateTimeFormat('fr-FR', JOUR).format(new Date(d));

/**
 * Les journees a relire : celles dont il reste une rencontre a jouer, au plus
 * tot d'abord. On part des matchs de la base plutot que d'un compteur, pour
 * que la fin de saison s'arrete d'elle-meme.
 */
async function prochainesJournees(limite = MAX_ROUNDS) {
  const matchs = await prisma.match.findMany({
    where: { season: SEASON, status: { not: 'FINISHED' }, kickoff: { gt: new Date() } },
    select: { round: true },
    distinct: ['round'],
    orderBy: { round: 'asc' },
    take: limite,
  });
  return matchs.map((m) => m.round);
}

/**
 * Relit les journees a venir et corrige horaires et diffuseurs.
 *
 * En simulation, rien n'est ecrit et le rapport dit exactement ce qui le
 * serait : c'est la façon de verifier une correction d'horaire avant de la
 * laisser fermer des pronostics.
 */
async function syncSchedule({ dryRun = false, rounds = null } = {}) {
  const cibles = rounds && rounds.length ? rounds : await prochainesJournees();
  const rapport = {
    ok: true, dryRun, rounds: cibles, sources: {},
    updated: 0, skipped: 0, unmatched: [], changes: [],
  };
  if (!cibles.length) {
    rapport.reason = 'Aucune journee a venir';
    return rapport;
  }

  const teams = await prisma.team.findMany();

  for (const round of cibles) {
    let events;
    try {
      events = (await lnr.fetchRound(round)).map(lnr.normalize);
      rapport.sources[`lnr J${round}`] = `${events.length} rencontres`;
    } catch (err) {
      // Le garde-fou de la source a parle. On journalise fort et on passe a la
      // journee suivante : surtout ne pas ecrire a moitie, et surtout ne pas
      // se taire — c'est le silence d'une source cassee qui avait laisse le
      // classement fige quatre jours.
      rapport.ok = false;
      rapport.sources[`lnr J${round}`] = `ECHEC — ${err.message}`;
      console.error(`[horaires] LNR J${round} : ${err.message}`);
      continue;
    }

    for (const ev of events) {
      if (!ev.kickoff && !ev.broadcaster) { rapport.skipped++; continue; }

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

      // Une rencontre homologuee ne se replanifie pas. Cette ligne est ce qui
      // rend le service inoffensif : au pire il ne fait rien.
      if (match.status === 'FINISHED') { rapport.skipped++; continue; }

      const data = {};
      const dit = [];

      if (ev.kickoff) {
        const ecart = Math.abs(new Date(ev.kickoff).getTime() - new Date(match.kickoff).getTime());
        if (ecart > SEUIL_MS) {
          data.kickoff = new Date(ev.kickoff);
          dit.push(`horaire ${affiche(match.kickoff)} → ${affiche(ev.kickoff)}`);
        }
      }

      if (ev.broadcaster && ev.broadcaster !== match.broadcaster) {
        data.broadcaster = ev.broadcaster;
        dit.push(match.broadcaster ? `diffuseur ${match.broadcaster} → ${ev.broadcaster}` : `diffuseur ${ev.broadcaster}`);
      }

      if (!dit.length) { rapport.skipped++; continue; }

      rapport.changes.push(`J${match.round} ${ev.home}–${ev.away} : ${dit.join(', ')}`);
      if (!dryRun) await prisma.match.update({ where: { id: match.id }, data });
      rapport.updated++;
    }
  }

  if (rapport.unmatched.length) console.warn('[horaires] non reconnus :', rapport.unmatched);
  console.log(
    `[horaires] ${dryRun ? '(simulation) ' : ''}J${cibles.join(', J')} : ` +
      `${rapport.updated} mis a jour, ${rapport.skipped} inchanges`
  );
  return rapport;
}

module.exports = { syncSchedule, prochainesJournees };
