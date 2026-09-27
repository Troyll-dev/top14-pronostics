const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lu = require('../src/services/sources/lnr-stats');
const forme = require('../src/services/team-stats.service');

/**
 * Les tests de la lecture des statistiques de match, et du cumul qui en fait un
 * indicateur de forme.
 *
 * Deux moities, et la seconde est la plus importante. Lire une page est
 * verifiable a l'oeil ; additionner cent quatre-vingts pages en attribuant a
 * chaque club ce qui lui revient ne l'est pas. Une erreur de cote — les essais
 * du visiteur comptes pour le recevant — reste parfaitement plausible a
 * l'affichage, et se lirait comme une contre-performance jusqu'en juin.
 */

/* --- la lecture de la page ----------------------------------------------- */

const barre = (titre, g, d, pct = '') => `
                                                <div class="stats-bar">
    <div class="stats-bar__title">${titre}</div>
    <div class="stats-bar__container">
        <div class="stats-bar__val stats-bar__val--left">
                            ${g}${pct}
                    </div>
                    <div class="stats-bar__wrapper" style="--progress: 50%">
                <div class="stats-bar__bar stats-bar__bar--left"></div>
        <div class="stats-bar__bar stats-bar__bar--right"></div>
    </div>
    <div class="stats-bar__val stats-bar__val--right">
                    ${d}${pct}
            </div>
</div>
</div>`;

const pastille = (couleur, n, libelle) => `
                <div class="stats-cards-fault stats-cards-fault--${couleur}">
            <div class="stats-cards-fault__container">
            <div class="stats-cards-fault__card">${n}</div>
            <div class="stats-cards-fault__label">${libelle}</div>
        </div>
    </div>`;

const cartons = (dom, ext) => `
    <div class="match-statistics__cards">
        <div class="match-statistics__cards-team">
            ${pastille('yellow', dom.jaune, 'Carton jaune')}
            ${pastille('orange', dom.orange, 'Carton orange')}
            ${pastille('red', dom.rouge, 'Carton rouge')}
        </div>
        <div class="match-statistics__cards-team">
            ${pastille('yellow', ext.jaune, 'Carton jaune')}
            ${pastille('orange', ext.orange, 'Carton orange')}
            ${pastille('red', ext.rouge, 'Carton rouge')}
        </div>
    </div>`;

function page({ dom = 'RC Toulon', ext = 'RC Vannes', barres = null, avecCartons = true } = {}) {
  const corps = barres || [
    barre('Essais accordés', 4, 1),
    barre('Possession de la balle', 50, 50, ' %'),
    barre('Pénalités concédées', 14, 9),
    avecCartons ? cartons({ jaune: 1, orange: 0, rouge: 0 }, { jaune: 0, orange: 0, rouge: 0 }) : '',
    barre('Plaquages manqués', 13, 24),
  ].join('');

  return `<!DOCTYPE html><html><body>
    <div class="match-statistics">
      <switcher-buttons home-team="Match" away-team="Joueurs" class-content="match-statistics__content">
        <div class="match-statistics__match">${corps}</div>
        <div class="match-statistics__players">
          <switcher-buttons
              home-team="${dom}"
              away-team="${ext}"
              class-content="match-statistics__rosters-content"
          ><div class="match-statistics__roster"></div></switcher-buttons>
        </div>
      </switcher-buttons>
    </div>
  </body></html>`;
}

test('chaque statistique rend son couple recevant / visiteur', () => {
  const s = lu.parseStats(page());
  assert.equal(s.barres[lu.ESSAIS].home, 4);
  assert.equal(s.barres[lu.ESSAIS].away, 1);
  assert.equal(s.barres[lu.PENALITES_CONCEDEES].home, 14);
  assert.equal(s.barres[lu.PLAQUAGES_MANQUES].away, 24);
  assert.equal(s.complete, true);
});

/**
 * La page contient DEUX `switcher-buttons`. Le premier commande l'onglet et
 * annonce `home-team="Match" away-team="Joueurs"` ; seul le second porte les
 * vrais clubs. Lire le premier ferait croire que le recevant s'appelle
 * « Match », et comme le service compare ce nom a celui de la base pour refuser
 * d'ecrire une statistique inversee, le garde-fou se declencherait a tous les
 * matchs — un service qui n'ecrit plus rien, et qui a une bonne raison.
 */
test('le nom des clubs n\'est pas celui du selecteur d\'onglet', () => {
  const s = lu.parseStats(page());
  assert.equal(s.homeTeam, 'RC Toulon');
  assert.equal(s.awayTeam, 'RC Vannes');
});

test('les pourcentages se lisent malgre l\'espace avant le signe', () => {
  const s = lu.parseStats(page());
  assert.equal(s.barres[lu.POSSESSION].home, 50);
  assert.equal(s.barres[lu.POSSESSION].pourcent, true);
  assert.equal(s.barres[lu.ESSAIS].pourcent, false);
});

/**
 * Les cartons sont poses entre deux barres de la rubrique « Fautes ». Un
 * analyseur qui essaie de deviner ou s'arrete un bloc y perd la barre suivante.
 */
test('une barre placee apres les cartons se lit encore', () => {
  const s = lu.parseStats(page());
  assert.ok(s.barres[lu.PLAQUAGES_MANQUES], 'la barre d\'apres les cartons existe');
  assert.equal(s.barres[lu.PLAQUAGES_MANQUES].home, 13);
});

test('les cartons des deux camps ne se melangent pas', () => {
  const s = lu.parseStats(page());
  assert.deepEqual(s.cartons.home, { jaune: 1, orange: 0, rouge: 0 });
  assert.deepEqual(s.cartons.away, { jaune: 0, orange: 0, rouge: 0 });
});

test('sans bloc de cartons, on rend des zeros et non des trous', () => {
  const s = lu.parseStats(page({ avecCartons: false }));
  assert.deepEqual(s.cartons.home, { jaune: 0, orange: 0, rouge: 0 });
});

/**
 * Toutes les barres sont enregistrees, pas seulement celles qui servent
 * aujourd'hui. La LNR en publie une vingtaine et en ajoutera : les garder evite
 * de relire cent quatre-vingts pages le jour ou l'on voudra les melees.
 */
test('les statistiques inconnues sont gardees sous une clef lisible', () => {
  const s = lu.parseStats(page({
    barres: [barre('Essais accordés', 1, 1), barre('Touches gagnées sur son propre lancer', 11, 14)].join(''),
  }));
  assert.equal(s.barres.touches_gagnees_sur_son_propre_lancer.home, 11);
  assert.equal(s.barres.touches_gagnees_sur_son_propre_lancer.titre, 'Touches gagnées sur son propre lancer');
});

test('la slugification enleve les accents et la ponctuation', () => {
  assert.equal(lu.clef('Pénalités concédées'), 'penalites_concedees');
  assert.equal(lu.clef('En-avant commis'), 'en_avant_commis');
  assert.equal(lu.clef('Mêlées refaites'), 'melees_refaites');
});

/**
 * Avant le coup d'envoi la page existe et ne contient aucune barre. C'est le
 * cas normal, pas une panne : `complete` le dit, et l'analyseur ne leve pas.
 */
test('une page vide n\'est pas une erreur', () => {
  for (const entree of ['', null, '<html></html>']) {
    const s = lu.parseStats(entree);
    assert.equal(s.complete, false);
    assert.deepEqual(s.barres, {});
  }
});

test('l\'onglet statistiques se deduit du chemin de feuille de match', () => {
  assert.equal(
    lu.urlStats('feuille-de-match/2026-2027/j4/11845-toulon-vannes'),
    'https://top14.lnr.fr/feuille-de-match/2026-2027/j4/11845-toulon-vannes/statistiques-du-match'
  );
  assert.equal(lu.urlStats(null), null);
});

/**
 * L'extrait litteral de la page du 27 septembre 2026. Il attrapera un
 * changement de balisage de la LNR le jour ou quelqu'un le remplacera par une
 * page fraiche.
 */
test('l\'extrait de la vraie page se lit exactement', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-stats-j4-extrait.html'), 'utf8');
  const s = lu.parseStats(html);

  assert.equal(s.homeTeam, 'RC Toulon');
  assert.equal(s.awayTeam, 'RC Vannes');
  assert.equal(s.complete, true);

  assert.deepEqual([s.barres[lu.ESSAIS].home, s.barres[lu.ESSAIS].away], [4, 1]);
  assert.deepEqual([s.barres[lu.PENALITES_CONCEDEES].home, s.barres[lu.PENALITES_CONCEDEES].away], [14, 9]);
  assert.deepEqual([s.barres[lu.PLAQUAGES_MANQUES].home, s.barres[lu.PLAQUAGES_MANQUES].away], [13, 24]);
  assert.deepEqual([s.barres[lu.OCCUPATION].home, s.barres[lu.OCCUPATION].away], [47, 53]);
  assert.equal(s.cartons.home.jaune, 1);
  assert.equal(s.cartons.away.jaune, 0);

  // « Pénalités réussies » et « Pénalités concédées » se ressemblent assez pour
  // qu'une clef trop courte les confonde.
  assert.equal(s.barres.penalites_reussies.away, 1);
  assert.notEqual(s.barres.penalites_reussies.home, s.barres.penalites_concedees.home);
});

/* --- le cumul par club ---------------------------------------------------- */

/** Une rencontre enregistree, telle qu'elle sort de la base. */
const M = (round, dom, ext, sDom, sExt, { essais, penalites, plaquages, possession = [50, 50], cJaune = [0, 0] }) => ({
  round,
  homeTeamId: dom, awayTeamId: ext,
  homeScore: sDom, awayScore: sExt,
  stats: {
    barres: {
      essais_accordes: { home: essais[0], away: essais[1] },
      penalites_concedees: { home: penalites[0], away: penalites[1] },
      plaquages_manques: { home: plaquages[0], away: plaquages[1] },
      possession_de_la_balle: { home: possession[0], away: possession[1] },
    },
    cartons: {
      home: { jaune: cJaune[0], orange: 0, rouge: 0 },
      away: { jaune: cJaune[1], orange: 0, rouge: 0 },
    },
  },
});

/**
 * Le test qui justifie tout le fichier. Un club joue une fois a domicile, une
 * fois a l'exterieur : ses essais sont donc a gauche dans un match et a droite
 * dans l'autre, et ceux qu'il encaisse sont l'inverse. C'est la seule erreur
 * vraiment couteuse de ce service, et elle ne se voit pas a l'affichage.
 */
test('les essais changent de cote selon que le club recoit ou se deplace', () => {
  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [14, 9], plaquages: [13, 24] }),
    M(3, 2, 1, 20, 30, { essais: [2, 5], penalites: [10, 8], plaquages: [20, 11] }),
  ]);

  // Club 1 : 4 essais chez lui, 5 a l'exterieur -> 9 ; il en a encaisse 1 puis 2.
  assert.equal(f[1].essaisPour, 9);
  assert.equal(f[1].essaisContre, 3);
  // Et symetriquement pour le club 2, sans quoi le total de la journee serait faux.
  assert.equal(f[2].essaisPour, 3);
  assert.equal(f[2].essaisContre, 9);
  assert.equal(f[1].essaisPour, f[2].essaisContre, 'ce que l\'un marque, l\'autre l\'encaisse');
});

test('les points viennent des scores enregistres, pas de la page', () => {
  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [0, 0], plaquages: [0, 0] }),
    M(3, 2, 1, 20, 30, { essais: [2, 5], penalites: [0, 0], plaquages: [0, 0] }),
  ]);
  assert.equal(f[1].pointsPour, 58);
  assert.equal(f[1].pointsContre, 30);
  assert.equal(f[1].pointsPourParMatch, 29);
});

test('les fautes suivent le bon camp', () => {
  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [14, 9], plaquages: [13, 24], cJaune: [1, 0] }),
    M(3, 2, 1, 20, 30, { essais: [2, 5], penalites: [10, 8], plaquages: [20, 11], cJaune: [0, 2] }),
  ]);
  assert.equal(f[1].penalitesConcedees, 22, '14 chez lui + 8 a l\'exterieur');
  assert.equal(f[2].penalitesConcedees, 19, '9 a l\'exterieur + 10 chez lui');
  assert.equal(f[1].plaquagesManques, 24);
  assert.equal(f[1].cartons, 3, '1 chez lui + 2 a l\'exterieur');
  assert.equal(f[2].cartons, 0);
});

test('les moyennes sont arrondies au dixieme', () => {
  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [14, 9], plaquages: [13, 24] }),
    M(3, 1, 3, 15, 15, { essais: [1, 1], penalites: [7, 7], plaquages: [10, 10] }),
    M(2, 1, 4, 10, 30, { essais: [1, 4], penalites: [9, 9], plaquages: [9, 9] }),
  ]);
  assert.equal(f[1].matchs, 3);
  assert.equal(f[1].essaisPourParMatch, 2, '(4+1+1)/3 = 2');
  assert.equal(f[1].penalitesParMatch, 10, '(14+7+9)/3 = 10');
  assert.equal(f[1].essaisContreParMatch, 2, '(1+1+4)/3 = 2');
});

/**
 * Une statistique absente ne doit pas compter pour zero : une moyenne calculee
 * sur des matchs dont la moitie n'a pas de chiffre serait fausse a la baisse, et
 * plausible. Ici la possession n'est connue que sur un match sur deux.
 */
test('une statistique manquante ne tire pas la moyenne vers le bas', () => {
  const sansPossession = M(3, 1, 2, 20, 10, { essais: [2, 1], penalites: [8, 8], plaquages: [10, 10] });
  delete sansPossession.stats.barres.possession_de_la_balle;

  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [14, 9], plaquages: [13, 24], possession: [60, 40] }),
    sansPossession,
  ]);
  assert.equal(f[1].possessionMoyenne, 60, 'un seul match connu, moyenne sur celui-la');
  assert.equal(f[1].matchs, 2, 'mais les deux matchs comptent pour le reste');
});

test('une rencontre sans statistiques du tout ne casse pas le cumul', () => {
  const f = forme.cumuler([
    M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [14, 9], plaquages: [13, 24] }),
    { round: 3, homeTeamId: 1, awayTeamId: 3, homeScore: 12, awayScore: 9, stats: null },
  ]);
  assert.equal(f[1].matchs, 2);
  assert.equal(f[1].essaisPour, 4);
  assert.equal(f[1].pointsPour, 40, 'le score reste connu meme sans page de statistiques');
});

test('aucune rencontre : un objet vide, pas une erreur', () => {
  assert.deepEqual(forme.cumuler([]), {});
});

test('un club qui n\'a pas joue n\'apparait pas', () => {
  const f = forme.cumuler([M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [0, 0], plaquages: [0, 0] })]);
  assert.deepEqual(Object.keys(f).sort(), ['1', '2']);
  assert.equal(f[9], undefined);
});

/**
 * Les compteurs de service de la moyenne de possession ne doivent pas fuir dans
 * la reponse : ils partiraient jusqu'au navigateur sans rien vouloir dire.
 */
test('la sortie ne contient pas les compteurs internes', () => {
  const f = forme.cumuler([M(4, 1, 2, 28, 10, { essais: [4, 1], penalites: [0, 0], plaquages: [0, 0] })]);
  assert.equal(f[1].possessionMatchs, undefined);
  assert.equal(f[1].possession, undefined);
  assert.equal(f[1].possessionMoyenne, 50);
});

test('moyenne rend null plutot que zero quand il n\'y a rien', () => {
  assert.equal(forme.moyenne(0, 0), null, 'zero sur zero match n\'est pas zero, c\'est inconnu');
  assert.equal(forme.moyenne(7, 2), 3.5);
});
