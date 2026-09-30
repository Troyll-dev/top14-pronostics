const test = require('node:test');
const assert = require('node:assert');

const { debutSemaine, choisirJournee } = require('../src/services/semaine');

/** Un instant, donne en heure de Paris, pour que les tests se lisent. */
function paris(texte) {
  // On passe par le decalage reel du fuseau pour ne pas avoir a l'ecrire a la
  // main — c'est precisement ce qu'on teste, autant ne pas le recopier.
  const approx = new Date(`${texte}:00.000Z`);
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  }).format(approx);
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/);
  const min = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(approx.getTime() - min * 60000);
}

/** Le debut de semaine, relu en heure de Paris, pour comparer lisiblement. */
function litParis(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(', ', ' ');
}

/* --- ou commence la semaine ---------------------------------------------- */

test('un mercredi apres-midi, la semaine a commence le matin meme', () => {
  assert.strictEqual(litParis(debutSemaine(paris('2026-09-30T15:00'))), '2026-09-30 00:00');
});

test('un mercredi a 0 h 30, la bascule a deja eu lieu', () => {
  // Le point qui compte : le mercredi appartient a sa propre semaine, il
  // n'attend pas le mercredi suivant.
  assert.strictEqual(litParis(debutSemaine(paris('2026-09-30T00:30'))), '2026-09-30 00:00');
});

test('le mardi soir, on est encore dans la semaine precedente', () => {
  assert.strictEqual(litParis(debutSemaine(paris('2026-10-06T23:30'))), '2026-09-30 00:00');
});

test('samedi, dimanche et lundi renvoient le meme mercredi', () => {
  const attendu = '2026-09-30 00:00';
  for (const t of ['2026-10-03T14:00', '2026-10-04T21:00', '2026-10-05T09:00']) {
    assert.strictEqual(litParis(debutSemaine(paris(t))), attendu, t);
  }
});

test('le mercredi suivant ouvre bien une nouvelle semaine', () => {
  assert.strictEqual(litParis(debutSemaine(paris('2026-10-07T08:00'))), '2026-10-07 00:00');
});

test('le mercredi parisien commence avant le mercredi UTC, en heure d ete', () => {
  // Mercredi 30 septembre, 0 h 30 a Paris : il est encore 22 h 30 le mardi en
  // UTC. Une version qui raisonnerait en UTC repondrait « semaine precedente ».
  const d = debutSemaine(new Date('2026-09-29T22:30:00.000Z'));
  assert.strictEqual(litParis(d), '2026-09-30 00:00');
  assert.strictEqual(d.toISOString(), '2026-09-29T22:00:00.000Z');
});

test('en heure d hiver, minuit a Paris tombe a 23 h UTC la veille', () => {
  const d = debutSemaine(paris('2026-12-16T12:00'));
  assert.strictEqual(litParis(d), '2026-12-16 00:00');
  assert.strictEqual(d.toISOString(), '2026-12-15T23:00:00.000Z');
});

test('une semaine a cheval sur le changement d heure reste ancree au mercredi', () => {
  // L'heure d'hiver arrive le dimanche 25 octobre 2026. Le samedi d'avant et le
  // lundi d'apres doivent designer le meme mercredi 21.
  assert.strictEqual(litParis(debutSemaine(paris('2026-10-24T18:00'))), '2026-10-21 00:00');
  assert.strictEqual(litParis(debutSemaine(paris('2026-10-26T18:00'))), '2026-10-21 00:00');
});

/* --- quelle journee on ouvre ---------------------------------------------- */

test('la journee de la semaine l emporte sur tout le reste', () => {
  assert.strictEqual(choisirJournee({ semaine: 5, derniere: 4, prochaine: 6 }), 5);
});

test('le samedi soir d une journee jouee d un seul tenant, on reste sur elle', () => {
  // C'est le cas qui a motive tout ce fichier. Les cinq matchs de la J5 ont ete
  // joues le samedi : `derniere` vaut 5, `prochaine` vaut deja 6. L'ancienne
  // regle prenait `prochaine` — le samedi etant apres le mercredi — et affichait
  // une journee vide toute la soiree. Le match du jour appartient toujours a la
  // semaine en cours, donc `semaine` vaut 5 et repond juste.
  assert.strictEqual(choisirJournee({ semaine: 5, derniere: 5, prochaine: 6 }), 5);
});

test('une semaine sans match reste sur la derniere jouee', () => {
  // Treve internationale : rien n'est programme entre ce mercredi et le suivant.
  // On ne saute pas sur une journee qui se jouera dans quinze jours et dont
  // personne n'a encore rien a dire.
  assert.strictEqual(choisirJournee({ semaine: undefined, derniere: 4, prochaine: 5 }), 4);
});

test('avant le premier match de la saison, on ouvre la premiere journee', () => {
  assert.strictEqual(choisirJournee({ semaine: undefined, derniere: undefined, prochaine: 1 }), 1);
});

test('une base vide ne fait pas tomber la page', () => {
  assert.strictEqual(choisirJournee({}), 1);
  assert.strictEqual(choisirJournee(), 1);
});
