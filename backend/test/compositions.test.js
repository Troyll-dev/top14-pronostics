const test = require('node:test');
const assert = require('node:assert/strict');
const comp = require('../src/services/sources/lnr-compositions');

/**
 * Les tests de l'analyseur de compositions.
 *
 * Le balisage reproduit ici est celui de la page
 * `/feuille-de-match/2026-2027/j4/11845-toulon-vannes/compositions`, relevee le
 * 27 septembre 2026 : memes classes, memes imbrications, memes encodages — y
 * compris l'apostrophe de K'POKU, qui arrive sous deux formes differentes dans
 * la meme page.
 *
 * Comme pour l'analyseur du calendrier, aucun appel reseau : un test qui
 * interroge le vrai site ne dit plus rien sur le code le jour ou le site est
 * lent.
 */

const fiche = ({ id, slug, numero, prenom, nom, poste, capitaine = false, pays = 'France' }) => `
                    <a href="https://top14.lnr.fr/joueur/${id}-${slug}" class="player-block${capitaine ? ' player-block--captain' : ''} player-block--lineup">
<img
    alt="${prenom} ${nom}"
    src="https://cdn.lnr.fr/joueur/${id}-${slug}/photo/photoFull.abc"
        class="player-block__player-img"
    loading="lazy"
/>
<div class="player-block__infos">
    <div class="player-block__top player-block__top--with-number">
        <div>
                <img alt="${pays}" src="https://cdn.lnr.fr/build/assets/fr.svg" class="player-block__country player-block__small-img" loading="lazy" />
                <span class="player-block__number">${numero}</span>
        </div>
    </div>
    <div class="player-block__bottom">
        <p class="player-block__name">${prenom} ${nom}</p>
        <p class="player-block__position">${poste}</p>
    </div>
</div>
    </a>`;

const titre = (t) => `
                    <div class="line-up__classic-title-container stretched__wrapper">
                        <h3 class="line-up__classic-title stretched__content title title--small">
                            ${t}
                        </h3>
                    </div>`;

const officiel = (nom, poste) => `
                        <div class="player-block player-block--lineup">
<img alt="${nom}" src="https://assets.lnr.fr/x.jpg" class="player-block__player-img" loading="lazy" />
<div class="player-block__infos">
    <div class="player-block__top"><div></div></div>
    <div class="player-block__bottom">
        <p class="player-block__name">${nom}</p>
        <p class="player-block__position">${poste}</p>
    </div>
</div>
    </div>`;

/** Un quinze plus un banc, numerotes dans l'ordre. */
function effectif(prefixe, { capitaineAu = 8, titulaires = 15, banc = 8 } = {}) {
  const liste = [];
  for (let n = 1; n <= titulaires + banc; n++) {
    liste.push({
      id: 1000 + n,
      slug: `${prefixe}-${n}`,
      numero: n,
      prenom: prefixe.toUpperCase(),
      nom: `J${n}`,
      poste: n <= 3 ? '1ère ligne' : 'Centre',
      capitaine: n === capitaineAu,
    });
  }
  return {
    titulaires: liste.slice(0, titulaires),
    remplacants: liste.slice(titulaires),
  };
}

function equipeHtml(eff) {
  return `
                    <div class="line-up__classic-team">
                    ${titre('XV de départ')}
                    <div class="line-up__grid">${eff.titulaires.map(fiche).join('')}</div>
                    ${titre('Remplaçants')}
                    <div class="line-up__grid">${eff.remplacants.map(fiche).join('')}</div>
                    </div>`;
}

function page({ dom = 'RC Toulon', ext = 'RC Vannes', effDom, effExt, officiels = true } = {}) {
  return `<!DOCTYPE html><html><body>
    <div class="line-up">
        <line-up-pitch
            home-team="${dom}"
            away-team="${ext}"
        >
            <div class="line-up__pitch-team">
                <a class="player-pitch player-pitch--position-1" href="https://top14.lnr.fr/joueur/9999-sur-le-terrain">
                    <p class="player-pitch__name"><span class="player-pitch__last-name">SUR LE TERRAIN</span></p>
                </a>
            </div>
        </line-up-pitch>
        <div class="line-up__classic">
            ${equipeHtml(effDom || effectif('dom'))}
            ${equipeHtml(effExt || effectif('ext', { capitaineAu: 7 }))}
            ${officiels ? `
            <div class="line-up__classic-team line-up__classic-team--officials">
                ${titre('Officiels de match')}
                <div class="line-up__grid line-up__grid--officials">
                    ${officiel('Evan Urruzmendi', 'Arbitre Central')}
                    ${officiel('Thomas Charabas', 'Juge de touche')}
                    ${officiel('Jean Luc Rebollal', 'Arbitre Vidéo')}
                </div>
            </div>` : ''}
        </div>
    </div>
</body></html>`;
}

/* --- ce que la page doit rendre ----------------------------------------- */

test('les deux equipes sont lues, quinze titulaires et huit remplacants chacune', () => {
  const c = comp.parseCompositions(page());
  assert.equal(c.homeTeam, 'RC Toulon');
  assert.equal(c.awayTeam, 'RC Vannes');
  assert.equal(c.home.titulaires.length, 15);
  assert.equal(c.home.remplacants.length, 8);
  assert.equal(c.away.titulaires.length, 15);
  assert.equal(c.away.remplacants.length, 8);
  assert.equal(c.complete, true);
});

test('chaque joueur porte son numero, son nom et son poste', () => {
  const c = comp.parseCompositions(page());
  assert.deepEqual(c.home.titulaires.map((j) => j.numero), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
  assert.deepEqual(c.home.remplacants.map((j) => j.numero), [16,17,18,19,20,21,22,23]);
  assert.equal(c.home.titulaires[0].nom, 'DOM J1');
  assert.equal(c.home.titulaires[0].poste, '1ère ligne');
  assert.equal(c.home.titulaires[0].id, 1001);
});

test('le capitaine est reconnu, et lui seul', () => {
  const c = comp.parseCompositions(page());
  const capitaines = c.home.titulaires.filter((j) => j.capitaine);
  assert.equal(capitaines.length, 1);
  assert.equal(capitaines[0].numero, 8);
  assert.equal(c.away.titulaires.filter((j) => j.capitaine)[0].numero, 7);
});

/**
 * Le bloc des officiels porte la meme classe que les deux equipes et ses fiches
 * la meme classe que celles des joueurs. Un analyseur naif compte donc trois
 * equipes et sept joueurs de plus — dont un arbitre titulaire.
 */
test('les officiels ne sont pas comptes comme une equipe', () => {
  const c = comp.parseCompositions(page());
  const noms = [...c.home.titulaires, ...c.home.remplacants, ...c.away.titulaires, ...c.away.remplacants]
    .map((j) => j.nom);
  assert.ok(!noms.some((n) => /Urruzmendi|Charabas/.test(n)), 'aucun officiel parmi les joueurs');
  assert.equal(c.arbitre, 'Evan Urruzmendi');
});

test('une page sans officiels se lit quand meme', () => {
  const c = comp.parseCompositions(page({ officiels: false }));
  assert.equal(c.arbitre, null);
  assert.equal(c.home.titulaires.length, 15);
});

/**
 * Le quinze dessine sur le terrain ne porte que les titulaires : le lire au
 * lieu de la liste classique ferait disparaitre le banc, c'est-a-dire
 * exactement l'information qu'on vient chercher.
 */
test('le quinze dessine sur le terrain n\'est pas relu en double', () => {
  const c = comp.parseCompositions(page());
  const tous = [...c.home.titulaires, ...c.home.remplacants];
  assert.equal(tous.length, 23);
  assert.ok(!tous.some((j) => j.id === 9999), 'le bloc terrain est ignore');
});

/* --- les encodages ------------------------------------------------------- */

test('les apostrophes encodees sont rendues telles quelles', () => {
  assert.equal(comp.decode('K&#039;POKU'), 'K\'POKU');
  assert.equal(comp.decode('K&amp;#039;POKU'), 'K\'POKU', 'double encodage des attributs');
  assert.equal(comp.decode('COTARMANAC&#039;H'), 'COTARMANAC\'H');
  assert.equal(comp.decode('  Léo   AMETLLA '), 'Léo AMETLLA');
});

test('un nom a apostrophe traverse l\'analyseur intact', () => {
  const eff = effectif('dom');
  eff.titulaires[5] = { ...eff.titulaires[5], prenom: 'José Junior', nom: 'K&#039;POKU' };
  const c = comp.parseCompositions(page({ effDom: eff }));
  assert.equal(c.home.titulaires[5].nom, 'José Junior K\'POKU');
});

/* --- la page pas encore remplie ----------------------------------------- */

/**
 * Le cas normal du mardi : la feuille de match existe des la publication du
 * calendrier, et reste vide jusqu'au jeudi ou au vendredi. Ce n'est pas une
 * panne, et l'analyseur ne doit surtout pas lever — c'est `complete` qui le dit,
 * pour que le service sache qu'il n'y a rien a ecrire.
 */
test('une page vide rend une composition incomplete, sans lever', () => {
  const c = comp.parseCompositions('<html><body><div class="line-up"></div></body></html>');
  assert.equal(c.complete, false);
  assert.equal(c.home.titulaires.length, 0);
  assert.equal(c.away.titulaires.length, 0);
});

test('une seule equipe publiee reste incomplete', () => {
  const html = page().replace(/<div class="line-up__classic-team">[\s\S]*?<\/div>\s*<div class="line-up__classic-team">/, '<div class="line-up__classic-team">');
  const c = comp.parseCompositions(html);
  assert.equal(c.complete, false);
});

test('rien du tout ne casse pas', () => {
  for (const entree of ['', null, undefined, '<html></html>']) {
    const c = comp.parseCompositions(entree);
    assert.equal(c.complete, false);
    assert.equal(c.arbitre, null);
  }
});

/* --- l'URL --------------------------------------------------------------- */

test('l\'onglet compositions se deduit du chemin de feuille de match', () => {
  assert.equal(
    comp.urlCompositions('feuille-de-match/2026-2027/j4/11845-toulon-vannes'),
    'https://top14.lnr.fr/feuille-de-match/2026-2027/j4/11845-toulon-vannes/compositions'
  );
  assert.equal(
    comp.urlCompositions('/feuille-de-match/2026-2027/j4/11840-perpignan-bordeaux-begles/'),
    'https://top14.lnr.fr/feuille-de-match/2026-2027/j4/11840-perpignan-bordeaux-begles/compositions'
  );
  assert.equal(comp.urlCompositions(null), null);
});

/**
 * Le numero de maillot fait foi, pas le libelle de poste : la LNR annonce
 * Mathis Ferte « Demi de mêlée » avec le 11 sur le dos. On garde le libelle
 * parce qu'il est juste la plupart du temps, mais on ne classe rien avec lui.
 */
test('le classement ne depend que du numero, jamais du libelle de poste', () => {
  const eff = effectif('dom');
  eff.titulaires[10] = { ...eff.titulaires[10], poste: 'Demi de mêlée' };  // le 11
  eff.remplacants[0] = { ...eff.remplacants[0], poste: 'Ailier' };          // le 16
  const c = comp.parseCompositions(page({ effDom: eff }));
  assert.equal(c.home.titulaires[10].numero, 11);
  assert.equal(c.home.titulaires.length, 15);
  assert.equal(c.home.remplacants[0].numero, 16);
});

/**
 * Sans intertitre lisible — un renommage de la LNR, une page traduite — on se
 * rabat sur le numero de maillot. Une liste approchee vaut mieux qu'une page
 * vide, et c'est la seule heuristique de ce fichier.
 */
test('sans intertitre, le numero 16 et plus passe sur le banc', () => {
  const html = page().replace(/line-up__classic-title/g, 'line-up__truc-renomme');
  const c = comp.parseCompositions(html);
  assert.equal(c.home.titulaires.length, 15);
  assert.equal(c.home.remplacants.length, 8);
  assert.equal(c.complete, true);
});

/* --- l'extrait de la vraie page ------------------------------------------ */

/**
 * Les fabriques ci-dessus reproduisent la structure de memoire ; celui-la est un
 * extrait litteral de la page du 27 septembre 2026, indentation et doubles
 * encodages compris. Il ne contient que quelques fiches par groupe — d'ou une
 * composition « incomplete », ce qui est justement l'occasion de verifier que
 * l'analyseur lit ce qu'il y a sans rien inventer.
 *
 * C'est le test qui attrapera un changement de balisage de la LNR le jour ou
 * quelqu'un remplacera cet extrait par une page fraiche.
 */
test('l\'extrait de la vraie page se lit exactement', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'lnr-compositions-j4-extrait.html'), 'utf8');
  const c = comp.parseCompositions(html);

  assert.equal(c.homeTeam, 'RC Toulon');
  assert.equal(c.awayTeam, 'RC Vannes');
  assert.equal(c.arbitre, 'Evan Urruzmendi');
  assert.equal(c.complete, false, 'l\'extrait est tronque, et doit se dire tel');

  assert.deepEqual(c.home.titulaires.map((j) => `${j.numero} ${j.nom}`), [
    '1 Léo AMETLLA',
    '6 José Junior K\'POKU',
    '8 Lewis Wesley LUDLAM',
    '11 Mathis FERTE',
  ]);
  assert.deepEqual(c.home.remplacants.map((j) => j.nom), ['Charles OLLIVON', 'Baptiste SERIN']);
  assert.equal(c.home.titulaires.find((j) => j.capitaine).nom, 'Lewis Wesley LUDLAM');
  assert.equal(c.away.titulaires.find((j) => j.capitaine).nom, 'Steeve BLANC MAPPAZ');
  assert.equal(c.away.titulaires[2].nom, 'Jean COTARMANAC\'H');
  assert.equal(c.away.titulaires[2].poste, 'Demi d\'ouverture');

  // Le quinze dessine sur le terrain apparait avant les listes et porte les
  // memes joueurs : il ne doit pas les doubler.
  assert.equal(c.home.titulaires.filter((j) => j.id === 2297).length, 1);
});

/* --- le service : comparaison et changements ----------------------------- */

const sync = require('../src/services/composition-sync.service');

const equipe = (noms, cap = null) => ({
  titulaires: noms.slice(0, 15).map((n, i) => ({ numero: i + 1, nom: n, capitaine: i + 1 === cap })),
  remplacants: noms.slice(15).map((n, i) => ({ numero: 16 + i, nom: n, capitaine: false })),
});
const quinze = (p) => Array.from({ length: 23 }, (_, i) => `${p}${i + 1}`);

/**
 * La signature evite une ecriture a chaque passage : quatre lectures par jour
 * sur une composition stable ne doivent produire aucune ecriture, sinon
 * `compositionAt` ne veut plus rien dire et le front annoncerait « mise a jour »
 * toutes les six heures.
 */
test('une composition identique ne declenche pas d\'ecriture', () => {
  const a = { home: equipe(quinze('A'), 8), away: equipe(quinze('B')), arbitre: 'X' };
  const b = { home: equipe(quinze('A'), 8), away: equipe(quinze('B')), arbitre: 'X' };
  assert.equal(sync.signature(a), sync.signature(b));
});

test('un seul changement suffit a distinguer deux compositions', () => {
  const a = { home: equipe(quinze('A'), 8), away: equipe(quinze('B')), arbitre: 'X' };
  const noms = quinze('A'); noms[9] = 'REMPLACANT SURPRISE';
  const b = { home: equipe(noms, 8), away: equipe(quinze('B')), arbitre: 'X' };
  assert.notEqual(sync.signature(a), sync.signature(b));
  assert.equal(sync.changements(a, b), 1);
});

/**
 * Les deux equipes portent les memes numeros, de 1 a 23. Un index par numero
 * seul les confond donc, et annonce zero changement quand le 10 du recevant
 * change — c'est exactement ce que faisait la premiere version.
 */
test('un changement chez le recevant ne se confond pas avec le visiteur', () => {
  const a = { home: equipe(quinze('A'), 8), away: equipe(quinze('B')), arbitre: 'X' };
  const noms = quinze('A'); noms[9] = 'AUTRE OUVREUR';
  const b = { home: equipe(noms, 8), away: equipe(quinze('B')), arbitre: 'X' };
  assert.equal(sync.changements(a, b), 1, 'le 10 du recevant compte pour un');

  const nomsB = quinze('B'); nomsB[9] = 'AUTRE OUVREUR VISITEUR';
  const c = { home: equipe(noms, 8), away: equipe(nomsB), arbitre: 'X' };
  assert.equal(sync.changements(a, c), 2, 'un de chaque cote fait deux');
});

test('le brassard change la signature', () => {
  const a = { home: equipe(quinze('A'), 8), away: equipe(quinze('B')), arbitre: 'X' };
  const b = { home: equipe(quinze('A'), 7), away: equipe(quinze('B')), arbitre: 'X' };
  assert.notEqual(sync.signature(a), sync.signature(b), 'un capitaine change est une information');
});

test('l\'arbitre fait partie de la signature', () => {
  const a = { home: equipe(quinze('A')), away: equipe(quinze('B')), arbitre: 'Urruzmendi' };
  const b = { home: equipe(quinze('A')), away: equipe(quinze('B')), arbitre: 'Raynal' };
  assert.notEqual(sync.signature(a), sync.signature(b));
});

test('une premiere publication ne compte pas de changements', () => {
  const b = { home: equipe(quinze('A')), away: equipe(quinze('B')), arbitre: null };
  assert.equal(sync.changements(null, b), null, 'null veut dire « publiee », pas « 23 changements »');
});

test('signature tolere le vide', () => {
  assert.equal(sync.signature(null), '');
  assert.equal(sync.signature({}), '||');
});

/**
 * Ce qui part en base ne contient que ce qui sert : pas de `complete`, qui est
 * une conclusion de l'analyseur et non une donnee, et pas de doublon du nom des
 * clubs, que la rencontre porte deja.
 */
test('on n\'ecrit que ce qui sert', () => {
  const lu = comp.parseCompositions(page());
  const data = sync.aEcrire({ ...lu, url: 'https://exemple/compositions' });
  assert.deepEqual(Object.keys(data).sort(), ['arbitre', 'away', 'home', 'url']);
  assert.equal(data.home.titulaires.length, 15);
});
