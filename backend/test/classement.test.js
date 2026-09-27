const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lnrc = require('../src/services/sources/lnr-classement');

/**
 * Les tests de la lecture du classement officiel.
 *
 * Ce fichier existe parce qu'une supposition non verifiee a coute cent vingt
 * lignes de code : on avait ecrit que cette page etait construite dans le
 * navigateur, et reconstitue le classement a partir des resultats. Elle est
 * rendue par le serveur.
 *
 * Les tests portent donc moins sur « est-ce que ca lit » — l'extrait de la vraie
 * page le montre — que sur les deux facons de lire **faux sans le savoir** : se
 * tromper de colonne, et se tromper de ligne.
 */

/* --- une page de classement, reduite a sa structure ---------------------- */

const cel = (v, premier = false) => `
    <div class="table-line__cell-wrapper table-line__cell-wrapper--small">
        <div class="${premier ? 'table-line__cell--small' : ''}">
            ${v}
        </div>
    </div>`;

const tete = (t) => `
    <div class="table-line__cell-wrapper table-line__cell-wrapper--small">
        <div class="ranking__head">
            ${t}
        </div>
    </div>`;

const forme = (s) => `
    <div class="table-line__cell-wrapper table-line__cell-wrapper--history">
        <div class="table-line__cell--history">
            <div class="matches-history">
                ${[...s].map((l) => `
                <a href=https://top14.lnr.fr/feuille-de-match/2026-2027/j1/1-x class="matches-history__match-wrapper">
                    <div class="matches-history__match matches-history__match--${l.toLowerCase()} matches-history__match--ranking">${l}</div>
                </a>`).join('')}
            </div>
        </div>
    </div>`;

const suivant = (adv, date, lieu) => `
    <div class="table-line__cell-wrapper table-line__cell-wrapper--next-match">
        <div class="">
            <a href="https://top14.lnr.fr/feuille-de-match/2026-2027/j5/999-x-y" class="next-match">
                <div class="next-match__location"><i class="icon icon--${lieu}"></i></div>
                <div class="next-match__logo-container"><img alt="${adv}" src="x" class="next-match__logo" /></div>
                <div class="next-match__infos-block">
                    <div class="next-match__infos next-match__infos--full">
                        <p class="next-match__text">${adv}</p>
                        <p class="next-match__text">${date}</p>
                    </div>
                    <p class="next-match__location-text">${lieu === 'home' ? 'À domicile' : 'À l&#039;extérieur'}</p>
                </div>
            </a>
        </div>
    </div>`;

const fige = (c, i) => `
    <div class="table-line table-line--ranking-full table-line--ranking-fixed">
        <div class="table-line__cell-wrapper table-line__cell-wrapper--small table-line__cell-wrapper--rank table-line__cell-wrapper--rank-${i + 1}">
            <div class="ranking-item__rank ranking-item__rank--variant ranking-item__rank--${c.variation || 'same'}">${i + 1}</div>
        </div>
        <div class="table-line__cell-wrapper table-line__cell-wrapper--full table-line__cell-wrapper--club-logo">
            <div class="table-line__cell--imaged ">
                <span class="table-line__cell-image-item">
                    <img alt="${c.nom}" src="https://cdn.lnr.fr/club/${c.slug}/photo/logo.abc" class="table-line__cell-image" loading="lazy" />
                </span>
            </div>
        </div>
    </div>`;

const defile = (c) => `
    <div class="table-line table-line--ranking-full table-line--ranking-scrollable">
        <div class="table-line__cell-wrapper table-line__cell-wrapper--full table-line__cell-wrapper--club-name">
            <div class="">
                <a href="https://top14.lnr.fr/club/${c.slug}" class="base-link base-link--black"> ${c.nom}</a>
            </div>
        </div>
        ${c.valeurs.map((v, i) => cel(v, i === 0)).join('')}
        ${forme(c.forme || 'VVVD')}
        ${suivant(c.adv || 'XXX', c.date || '3 octobre', c.lieu || 'home')}
    </div>`;

/** Quatorze clubs plausibles, ordonnes, avec des valeurs distinctes par colonne. */
function equipes(n = 14) {
  return Array.from({ length: n }, (_, i) => ({
    slug: `club-${i + 1}`,
    nom: `Club ${i + 1}`,
    variation: ['same', 'up', 'down'][i % 3],
    //        Pts        M  G  N  P  Bonus  PtsM      PtsE    Diff
    valeurs: [50 - i * 3, 4, 3, 0, 1, 2, 100 + i, 90 + i, `${i < 7 ? '+' : '-'}${10 + i}`],
  }));
}

function page({
  clubs = equipes(),
  entetes = ['Pts', 'M', 'G', 'N', 'P', 'Bonus', 'Pts M.', 'Pts E.', 'Diff'],
  figes = null,
  semaine = 3,
} = {}) {
  const f = figes || clubs;
  return `<!DOCTYPE html><html><body>
  <filters-fixtures :current-week='{"id":1843,"name":"Journee ${semaine}","slug":"j${semaine}","number":${semaine}}' ></filters-fixtures>
  <div class="ranking ranking--full"><div class="ranking__main">
    <div class="ranking__fixed-block">
      <div class="table-line table-line--no-border table-line--full-ranking-heading-fixed">
        <div class="table-line__cell-wrapper table-line__cell-wrapper--small table-line__cell-wrapper--rank"><div class="">Rang</div></div>
        <div class="table-line__cell-wrapper table-line__cell-wrapper--full table-line__cell-wrapper--club-logo"><div class="">Club</div></div>
      </div>
      ${f.map(fige).join('')}
    </div>
    <div class="ranking__scroll-block"><div class="ranking__scrollable-cells">
      <div class="table-line table-line--no-border table-line--full-ranking-heading">
        <div class="table-line__cell-wrapper table-line__cell-wrapper--full table-line__cell-wrapper--club-name"><div class=""></div></div>
        ${entetes.map(tete).join('')}
        <div class="table-line__cell-wrapper table-line__cell-wrapper--history"><div class="ranking__head">Etat de forme</div></div>
        <div class="table-line__cell-wrapper table-line__cell-wrapper--next-match"><div class="ranking__head">Prochain match</div></div>
      </div>
      ${clubs.map(defile).join('')}
    </div></div>
  </div></div>
  </body></html>`;
}

/* --- la lecture de base --------------------------------------------------- */

test('les quatorze clubs sont lus, dans l\'ordre du classement', () => {
  const r = lnrc.parseClassement(page());
  assert.equal(r.lignes.length, 14);
  assert.deepEqual(r.lignes.map((l) => l.rank), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.equal(r.lignes[0].club, 'Club 1');
  assert.equal(r.lignes[13].club, 'Club 14');
});

test('chaque colonne arrive sous son propre nom', () => {
  const [premier] = lnrc.parseClassement(page()).lignes;
  assert.equal(premier.points, 50);
  assert.equal(premier.played, 4);
  assert.equal(premier.won, 3);
  assert.equal(premier.drawn, 0);
  assert.equal(premier.lost, 1);
  assert.equal(premier.bonus, 2);
  assert.equal(premier.pointsFor, 100);
  assert.equal(premier.pointsAgainst, 90);
  assert.equal(premier.diff, 10);
  assert.equal(premier.slug, 'club-1');
});

test('la difference negative garde son signe', () => {
  const r = lnrc.parseClassement(page());
  const dernier = r.lignes[13];
  assert.equal(dernier.diff, -23);
  assert.ok(dernier.diff < 0);
});

test('l\'etat de forme se lit dans l\'ordre, sans la classe de mise en forme', () => {
  const clubs = equipes();
  clubs[0].forme = 'VVDN';
  const r = lnrc.parseClassement(page({ clubs }));
  assert.deepEqual(r.lignes[0].forme, ['V', 'V', 'D', 'N']);
  assert.ok(!r.lignes[0].forme.includes('RANKING'), 'la classe --ranking n\'est pas un resultat');
});

test('le prochain match dit l\'adversaire, la date et le lieu', () => {
  const clubs = equipes();
  clubs[0].adv = 'UBB'; clubs[0].date = '3 octobre'; clubs[0].lieu = 'away';
  const r = lnrc.parseClassement(page({ clubs }));
  assert.equal(r.lignes[0].prochain.adversaire, 'UBB');
  assert.equal(r.lignes[0].prochain.date, '3 octobre');
  assert.equal(r.lignes[0].prochain.domicile, false);
  assert.match(r.lignes[0].prochain.url, /feuille-de-match/);
});

test('la variation de rang est relevee', () => {
  const r = lnrc.parseClassement(page());
  assert.deepEqual(r.lignes.slice(0, 3).map((l) => l.variation), ['same', 'up', 'down']);
});

/* --- se tromper de colonne ------------------------------------------------ */

/**
 * L'ordre des colonnes est lu dans l'en-tete, pas suppose. Le jour ou la LNR
 * intervertit « Pts M. » et « Pts E. », un analyseur qui compte les cellules
 * annonce que le dernier du classement a la meilleure attaque — et rien, nulle
 * part, ne signale l'erreur.
 */
test('intervertir deux colonnes dans l\'en-tete intervertit les valeurs lues', () => {
  const clubs = equipes();
  clubs.forEach((c) => { const v = c.valeurs; [v[6], v[7]] = [v[7], v[6]]; });

  const r = lnrc.parseClassement(page({
    clubs,
    entetes: ['Pts', 'M', 'G', 'N', 'P', 'Bonus', 'Pts E.', 'Pts M.', 'Diff'],
  }));

  // Les valeurs ont bouge dans la page ET dans l'en-tete : le resultat doit
  // etre identique a la page d'origine.
  assert.equal(r.lignes[0].pointsFor, 100);
  assert.equal(r.lignes[0].pointsAgainst, 90);
});

test('une colonne indispensable absente fait lever', () => {
  assert.throws(
    () => lnrc.parseClassement(page({ entetes: ['Pts', 'M', 'G', 'N', 'Bonus', 'Diff'] })),
    /colonnes manquantes/
  );
});

test('une colonne inconnue est ignoree sans casser les autres', () => {
  const clubs = equipes().map((c) => ({ ...c, valeurs: [...c.valeurs.slice(0, 6), 7, ...c.valeurs.slice(6)] }));
  const r = lnrc.parseClassement(page({
    clubs,
    entetes: ['Pts', 'M', 'G', 'N', 'P', 'Bonus', 'Essais', 'Pts M.', 'Pts E.', 'Diff'],
  }));
  assert.equal(r.lignes[0].points, 50);
  assert.equal(r.lignes[0].pointsFor, 100, 'la colonne inconnue ne decale rien');
});

/**
 * La ligne d'en-tete du bloc figé porte presque la meme classe que celle du bloc
 * defilant — `-heading-fixed` contre `-heading` — et elle vient en premier dans
 * la page. La lire a sa place rend un ordre de colonnes vide, donc une page
 * declaree illisible alors qu'elle se lit parfaitement.
 */
test('l\'en-tete du bloc figé n\'est pas pris pour celui du tableau', () => {
  const ordre = lnrc.ordreDesColonnes(page());
  assert.deepEqual(ordre, ['points', 'played', 'won', 'drawn', 'lost', 'bonus', 'pointsFor', 'pointsAgainst', 'diff']);
});

/* --- se tromper de ligne -------------------------------------------------- */

/**
 * Le rang vient d'un bloc, les chiffres d'un autre, et rien ne les relie que
 * l'ordre d'apparition. On apparie donc par nom de club. Ce test insere une
 * ligne de plus dans le bloc figé : un appariement par indice donnerait a
 * chaque club le rang de son voisin, silencieusement.
 */
test('une ligne en trop dans le bloc figé ne decale pas les rangs', () => {
  const clubs = equipes();
  const figes = [{ slug: 'promu', nom: 'Club Fantome', variation: 'up' }, ...clubs];

  const r = lnrc.parseClassement(page({ clubs, figes }));
  // Les clubs reels prennent le rang de leur propre ligne, pas celui du voisin.
  const parNom = new Map(r.lignes.map((l) => [l.club, l.rank]));
  assert.equal(parNom.get('Club 1'), 2, 'le fantome occupe le rang 1 dans le bloc figé');
  assert.equal(parNom.get('Club 2'), 3);
  // Et l'ordre rendu suit les rangs lus, pas l'ordre du tableau defilant.
  assert.deepEqual(r.lignes.map((l) => l.club).slice(0, 2), ['Club 1', 'Club 2']);
});

/**
 * L'inverse : un club present dans le tableau mais absent du bloc des rangs.
 * Ici on prefere lever. Un classement ou un club n'a pas de rang s'afficherait
 * avec un trou, ou pire, trie n'importe comment.
 */
test('un club sans rang fait lever plutot que d\'afficher un trou', () => {
  const clubs = equipes();
  assert.throws(
    () => lnrc.parseClassement(page({ clubs, figes: clubs.slice(1) })),
    /rang introuvable/
  );
});

test('moins de quatorze clubs fait lever', () => {
  assert.throws(() => lnrc.parseClassement(page({ clubs: equipes(13) })), /13 clubs lus sur 14/);
});

test('une page vide fait lever, et ne rend pas un classement vide', () => {
  for (const entree of ['', null, '<html></html>']) {
    assert.throws(() => lnrc.parseClassement(entree));
  }
});

/* --- la journee ----------------------------------------------------------- */

/**
 * Le 27 septembre 2026, la page se disait « J3 » et ses lignes comptaient deja
 * quatre rencontres pour douze clubs sur quatorze. L'etiquette suit la journee
 * en cours au sens de la LNR ; la profondeur reelle du tableau se lit dans la
 * colonne M. C'est la seconde qui dit ce que le classement contient.
 */
test('la journee annoncee et la profondeur reelle sont rendues separement', () => {
  const clubs = equipes();
  clubs[13].valeurs[1] = 3;   // un club a un match de retard
  const r = lnrc.parseClassement(page({ clubs, semaine: 3 }));
  assert.equal(r.journeeAnnoncee, 3);
  assert.equal(r.journeesJouees, 4, 'la profondeur se lit sur les lignes, pas sur l\'etiquette');
});

/* --- l'extrait de la vraie page ------------------------------------------- */

/**
 * Les valeurs ci-dessous sont celles du classement du 27 septembre 2026, telles
 * qu'elles figurent sur la page de la LNR. Elles servent de temoin : si un jour
 * l'analyseur rend autre chose sur ce fichier, c'est lui qui a change.
 */
test('l\'extrait de la vraie page rend le classement exact', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  const r = lnrc.parseClassement(html);

  assert.equal(r.lignes.length, 14);
  assert.equal(r.journeeAnnoncee, 3);
  assert.equal(r.journeesJouees, 4);

  assert.deepEqual(r.lignes.slice(0, 3).map((l) => l.club),
    ['LOU Rugby', 'Section Paloise', 'Aviron Bayonnais']);
  assert.equal(r.lignes[13].club, 'RC Vannes');

  const lou = r.lignes[0];
  assert.equal(lou.slug, 'lyon');
  assert.equal(lou.points, 14);
  assert.equal(lou.played, 4);
  assert.equal(lou.won, 3);
  assert.equal(lou.lost, 1);
  assert.equal(lou.bonus, 2);
  assert.equal(lou.pointsFor, 149);
  assert.equal(lou.pointsAgainst, 123);
  assert.equal(lou.diff, 26);
  assert.deepEqual(lou.forme, ['V', 'V', 'V', 'D']);
  assert.equal(lou.prochain.adversaire, 'UBB');
  assert.equal(lou.prochain.domicile, false);

  const vannes = r.lignes[13];
  assert.equal(vannes.points, 0);
  assert.equal(vannes.won, 0);
  assert.equal(vannes.lost, 4);
  assert.equal(vannes.diff, -47);
  assert.deepEqual(vannes.forme, ['D', 'D', 'D', 'D']);

  // Toulon : huit points avec une seule victoire, grace a quatre bonus. C'est le
  // genre de ligne qu'un recalcul approximatif rate.
  const toulon = r.lignes.find((l) => l.slug === 'toulon');
  assert.equal(toulon.won, 1);
  assert.equal(toulon.bonus, 4);
  assert.equal(toulon.points, 8);
});

/**
 * La coherence interne du tableau lu : la difference doit valoir points marques
 * moins points encaisses, pour les quatorze clubs. Si une colonne avait glisse
 * d'un cran, cette egalite tomberait.
 */
test('difference = points marques - points encaisses, pour les quatorze', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  for (const l of lnrc.parseClassement(html).lignes) {
    assert.equal(l.diff, l.pointsFor - l.pointsAgainst, `incoherence sur ${l.club}`);
  }
});

/**
 * Et la coherence du bareme : quatre points par victoire, deux par nul, plus les
 * bonus. Un ecart signalerait soit une colonne mal lue, soit des points de
 * penalisation — que seul le tableau officiel connait, et qui sont justement une
 * des raisons de le lire plutot que de le recalculer.
 */
test('le total de points s\'explique par le bareme officiel', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  for (const l of lnrc.parseClassement(html).lignes) {
    assert.equal(
      l.points, l.won * 4 + l.drawn * 2 + l.bonus,
      `${l.club} : ${l.points} points pour ${l.won}V ${l.drawn}N et ${l.bonus} bonus`
    );
    assert.equal(l.won + l.drawn + l.lost, l.played, `${l.club} : total de matchs incoherent`);
  }
});

/* --- la forme mise en base ------------------------------------------------ */

const { depuisOfficiel } = require('../src/services/standings.service');

/**
 * Le tableau officiel doit arriver en base sous la meme forme que le tableau
 * calcule, sans quoi la page Championnat casserait au premier deploiement.
 */
test('le tableau officiel prend la forme attendue par le reste du site', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  const lignes = depuisOfficiel(lnrc.parseClassement(html).lignes);

  const [premier] = lignes;
  for (const champ of ['slug', 'rank', 'played', 'won', 'drawn', 'lost',
                       'pointsFor', 'pointsAgainst', 'diff', 'points']) {
    assert.ok(premier[champ] !== undefined, `champ ${champ} manquant`);
  }
  assert.equal(premier.slug, 'lyon');
  assert.equal(premier.rank, 1);
  assert.equal(premier.points, 14);
});

/**
 * La page donne le total des bonus, pas leur repartition. Rendre zero se
 * lirait comme « aucun bonus offensif » ; `null` se lit comme « on ne sait pas »,
 * et l'affichage peut montrer un tiret assume.
 */
test('les bonus non detailles valent null, pas zero', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  const [premier] = depuisOfficiel(lnrc.parseClassement(html).lignes);
  assert.equal(premier.bonus, 2, 'le total, lui, est connu');
  assert.equal(premier.bonusOff, null);
  assert.equal(premier.bonusDef, null);
});

/**
 * La mesure de fraicheur additionne la colonne M de toutes les lignes et divise
 * par deux. Elle doit donc donner le meme nombre sur le tableau officiel que sur
 * le tableau calcule — c'est ce qui permet de changer de source sans toucher a
 * l'alerte.
 */
test('la fraicheur se mesure pareil sur le tableau officiel', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-classement-extrait.html'), 'utf8');
  const lignes = depuisOfficiel(lnrc.parseClassement(html).lignes);
  const comptees = Math.round(lignes.reduce((s, r) => s + (r.played || 0), 0) / 2);
  // 12 clubs a 4 journees et 2 a 3 : (12*4 + 2*3) / 2 = 27 rencontres.
  assert.equal(comptees, 27);
});
