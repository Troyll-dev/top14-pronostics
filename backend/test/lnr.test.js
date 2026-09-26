const test = require('node:test');
const assert = require('node:assert/strict');
const lnr = require('../src/services/sources/lnr');

/**
 * Les tests de l'analyseur LNR.
 *
 * Ils ne touchent pas au reseau : les fabriques ci-dessous reproduisent la
 * structure des pages, relevee sur les journees 3 et 4 de la saison
 * 2026-2027. C'est volontaire — un test qui appelle le vrai site echoue le
 * jour ou le site est lent, et ne dit alors plus rien sur le code.
 *
 * En contrepartie ces tests ne verront pas un changement de structure de la
 * LNR : c'est le role du garde-fou de `fetchRound`, qui leve une erreur des
 * qu'une journee rend moins de sept rencontres.
 */

function rencontre({ dom, ext, score, heure, chaines = [], bonusDom, bonusExt, round = 4, id = 1101 }) {
  return `
  <div class="calendar-results__line">
    <div class="match-line">
      <a href="https://top14.lnr.fr/club/${dom.slug}" class="club-line__name">${dom.nom}</a>
      ${bonusDom ? `<span class='club-special-icon club-special-icon--active'>${bonusDom}</span>` : ''}
      <a href="https://top14.lnr.fr/feuille-de-match/2026-2027/j${round}/${id}-${dom.slug}-${ext.slug}">
        <p class="match-line__score">${score || '-'}</p>
      </a>
      ${bonusExt ? `<span class='club-special-icon club-special-icon--active'>${bonusExt}</span>` : ''}
      <a href="https://top14.lnr.fr/club/${ext.slug}" class="club-line__name">${ext.nom}</a>
      <div class="match-line__broadcast-infos">
        ${heure ? `<p class="match-line__time">${heure}</p>` : ''}
        ${chaines.map((c) => `<a href="" class="match-line__broadcaster-link">
            <img alt="${c}" src="https://assets.lnr.fr/1/2/3/logo.png" class="match-line__broadcaster" />
        </a>`).join('')}
      </div>
    </div>
  </div>`;
}

const page = (jour, lignes) =>
  `<html><body><h3 class="calendar-results__fixture-date">${jour}</h3>${lignes.join('')}</body></html>`;

const USAP = { slug: 'perpignan', nom: 'USA Perpignan' };
const UBB = { slug: 'bordeaux-begles', nom: 'Union Bordeaux-Bègles' };
const ST = { slug: 'toulouse', nom: 'Stade Toulousain' };
const MHR = { slug: 'montpellier', nom: 'Montpellier HR' };

const seul = (html) => lnr.parseRound(html).matchs[0];

test('les deux clubs sont lus dans le bon ordre', () => {
  const x = seul(page('samedi 26 septembre', [rencontre({ dom: USAP, ext: UBB, heure: '14h30' })]));
  assert.equal(x.homeSlug, 'perpignan');
  assert.equal(x.awaySlug, 'bordeaux-begles');
  assert.equal(x.homeTeam, 'USA Perpignan');
  assert.equal(x.awayTeam, 'Union Bordeaux-Bègles');
});

test('le score est lu, et son absence signifie « pas joue »', () => {
  const joue = seul(page('samedi 19 septembre', [rencontre({ dom: USAP, ext: UBB, score: '23 - 29' })]));
  assert.equal(joue.homeScore, 23);
  assert.equal(joue.awayScore, 29);
  assert.equal(joue.played, true);

  const avenir = seul(page('samedi 26 septembre', [rencontre({ dom: USAP, ext: UBB, heure: '14h30' })]));
  assert.equal(avenir.homeScore, null);
  assert.equal(avenir.played, false);
  assert.equal(avenir.final, false);
});

/**
 * L'attribution des bonus.
 *
 * C'est le point le plus fragile de l'analyseur : la page ne dit pas a qui
 * appartient un badge, elle le pose simplement avant ou apres le score. Une
 * erreur ici donnerait un classement faux de un a deux points par club, et
 * rien dans l'affichage ne le signalerait.
 */
test('un bonus place avant le score revient au club qui recoit', () => {
  const x = seul(page('samedi 19 septembre', [
    rencontre({ dom: USAP, ext: UBB, score: '40 - 10', bonusDom: 'Bo' }),
  ]));
  assert.deepEqual(x.bonus.home, { o: true, d: false });
  assert.deepEqual(x.bonus.away, { o: false, d: false });
});

test('un bonus place apres le score revient au club visiteur', () => {
  const x = seul(page('samedi 19 septembre', [
    rencontre({ dom: USAP, ext: UBB, score: '20 - 17', bonusExt: 'Bd' }),
  ]));
  assert.deepEqual(x.bonus.home, { o: false, d: false });
  assert.deepEqual(x.bonus.away, { o: false, d: true });
});

test('les deux clubs peuvent avoir un bonus sur la meme rencontre', () => {
  const x = seul(page('samedi 19 septembre', [
    rencontre({ dom: USAP, ext: UBB, score: '35 - 30', bonusDom: 'Bo', bonusExt: 'Bd' }),
  ]));
  assert.equal(x.bonus.home.o, true);
  assert.equal(x.bonus.away.d, true);
});

test('le diffuseur est lu dans l\'attribut alt, et les chaines multiples sont gardees', () => {
  const un = lnr.normalize(seul(page('samedi 26 septembre', [
    rencontre({ dom: USAP, ext: UBB, heure: '14h30', chaines: ['Canal + Sport'] }),
  ])));
  assert.equal(un.broadcaster, 'Canal + Sport');

  const deux = lnr.normalize(seul(page('samedi 26 septembre', [
    rencontre({ dom: ST, ext: MHR, heure: '16h35', chaines: ['Canal +', 'Canal + Live'] }),
  ])));
  assert.equal(deux.broadcaster, 'Canal + / Canal + Live');

  const aucun = lnr.normalize(seul(page('samedi 26 septembre', [
    rencontre({ dom: ST, ext: MHR, heure: '16h35' }),
  ])));
  assert.equal(aucun.broadcaster, null, 'pas de chaine annoncee : null, pas une chaine vide');
});

/**
 * Le fuseau horaire.
 *
 * La page annonce une heure de Paris, la base enregistre en UTC, et la saison
 * traverse deux changements d'heure. Un decalage code en dur marcherait
 * jusqu'au dernier dimanche d'octobre puis decalerait tous les matchs d'hiver
 * d'une heure — et c'est l'heure qui ferme la saisie des pronostics.
 */
test('l\'heure de Paris est convertie en UTC, ete comme hiver', () => {
  const cas = [
    ['samedi 26 septembre', '14h30', '2026-09-26T12:30:00.000Z'],  // +2 h
    ['dimanche 27 septembre', '21h05', '2026-09-27T19:05:00.000Z'], // +2 h
    ['samedi 24 octobre', '21h05', '2026-10-24T19:05:00.000Z'],     // +2 h, veille du changement
    ['dimanche 25 octobre', '14h30', '2026-10-25T13:30:00.000Z'],   // +1 h, jour du changement
    ['samedi 10 janvier', '21h05', '2027-01-10T20:05:00.000Z'],     // +1 h
    ['dimanche 28 mars', '16h35', '2027-03-28T14:35:00.000Z'],      // +2 h, jour du changement
  ];
  for (const [jour, heure, attendu] of cas) {
    const x = seul(page(jour, [rencontre({ dom: USAP, ext: UBB, heure })]));
    assert.equal(x.kickoff.toISOString(), attendu, `${jour} ${heure}`);
  }
});

test('l\'annee se deduit de la saison : aout-decembre puis janvier-juillet', () => {
  const auto = seul(page('samedi 26 septembre', [rencontre({ dom: USAP, ext: UBB, heure: '14h30' })]));
  const hiver = seul(page('samedi 10 janvier', [rencontre({ dom: USAP, ext: UBB, heure: '14h30' })]));
  assert.equal(auto.kickoff.getUTCFullYear(), 2026);
  assert.equal(hiver.kickoff.getUTCFullYear(), 2027);
});

test('sans heure sur la page, le coup d\'envoi reste nul plutot que minuit', () => {
  const x = lnr.normalize(seul(page('samedi 19 septembre', [
    rencontre({ dom: USAP, ext: UBB, score: '23 - 29' }),
  ])));
  assert.equal(x.kickoff, null, 'une date a minuit ecraserait un horaire correct');
});

/**
 * Le moment ou un score devient definitif. Deux heures trente apres le coup
 * d'envoi — la regle qui remplace les trente-six heures comptees depuis
 * minuit, lesquelles laissaient les matchs du samedi « en cours » jusqu'au
 * dimanche apres-midi, et les points des pronostics avec eux.
 */
test('un score est definitif 2h30 apres le coup d\'envoi, pas avant', () => {
  const dans = (ms) => {
    const d = new Date(Date.now() + ms);
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const p = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', hour12: false,
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const v = Object.fromEntries(p.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
    return {
      jour: `${v.weekday} ${v.day} ${v.month}`,
      heure: `${v.hour}h${v.minute}`,
      annee: d.getUTCFullYear(),
    };
  };

  const H = 3600 * 1000;
  // Un match commence il y a trois heures : fini.
  const fini = dans(-3 * H);
  // Un match commence il y a une heure : en cours.
  const encours = dans(-1 * H);

  for (const [quand, attendu] of [[fini, true], [encours, false]]) {
    // La deduction d'annee suit la saison ; on saute le cas ou le decalage
    // ferait changer d'annee, sans interet ici.
    const x = seul(page(quand.jour, [
      rencontre({ dom: USAP, ext: UBB, score: '23 - 20', heure: quand.heure }),
    ]));
    assert.equal(x.final, attendu, `${quand.jour} ${quand.heure} devrait etre final=${attendu}`);
  }
});

test('un club inconnu est signale, pas devine', () => {
  const html = page('samedi 26 septembre', [
    rencontre({ dom: { slug: 'biarritz', nom: 'Biarritz Olympique' }, ext: UBB, heure: '14h30' }),
  ]);
  const { inconnus } = lnr.parseRound(html);
  assert.deepEqual(inconnus, ['biarritz']);
});

test('la journee et le numero de feuille de match sont lus', () => {
  const x = lnr.normalize(seul(page('samedi 26 septembre', [
    rencontre({ dom: USAP, ext: UBB, heure: '14h30', round: 7, id: 1234 }),
  ])));
  assert.equal(x.round, 7);
  assert.equal(x.externalId, '1234', 'l\'identifiant externe est le numero de feuille de match');
});

test('plusieurs rencontres, et chacune rattachee a son intertitre de date', () => {
  const html = `<html><body>
    <h3 class="calendar-results__fixture-date">samedi 26 septembre</h3>
    ${rencontre({ dom: USAP, ext: UBB, heure: '14h30', id: 1101 })}
    <h3 class="calendar-results__fixture-date">dimanche 27 septembre</h3>
    ${rencontre({ dom: ST, ext: MHR, heure: '21h05', id: 1107 })}
  </body></html>`;
  const { matchs } = lnr.parseRound(html);
  assert.equal(matchs.length, 2);
  assert.equal(matchs[0].kickoff.toISOString(), '2026-09-26T12:30:00.000Z');
  assert.equal(matchs[1].kickoff.toISOString(), '2026-09-27T19:05:00.000Z');
});
