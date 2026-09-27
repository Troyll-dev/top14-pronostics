/**
 * Calcul du classement Top 14 a partir des rencontres.
 *
 * Pourquoi calculer plutot que lire un tableau tout fait. Parce que tout
 * tableau publie est un point de defaillance : allrugby a cesse de repondre
 * correctement pendant quatre jours sans que rien ne le signale. Ici la seule
 * dependance est la page des resultats de la LNR, qui fait autorite et dont on
 * verifie deja qu'elle rend bien sept rencontres par journee.
 *
 * Bareme officiel, tel que la LNR le publie :
 *   victoire 4 points, match nul 2, defaite 0
 *   bonus offensif  : 1 point pour 3 essais de plus que l'adversaire
 *   bonus defensif  : 1 point pour une defaite de 5 points ou moins
 *
 * On ne recalcule pas les bonus — on les lit. Le bonus offensif dependrait du
 * nombre d'essais, que la LNR ne publie pas dans ses pages serveur ; en
 * revanche elle affiche les badges Bo et Bd par match, ce qui donne le meme
 * resultat sans avoir a compter quoi que ce soit.
 */

const VICTOIRE = 4;
const NUL = 2;

function vide(slug) {
  return {
    slug, played: 0, won: 0, drawn: 0, lost: 0,
    pointsFor: 0, pointsAgainst: 0, bonusOff: 0, bonusDef: 0, points: 0,
  };
}

/**
 * `matchs` : rencontres normalisees par la source LNR, toutes journees
 * confondues. Les rencontres non jouees sont ignorees.
 */
function agreger(matchs) {
  const t = new Map();
  const prendre = (slug) => {
    if (!t.has(slug)) t.set(slug, vide(slug));
    return t.get(slug);
  };

  for (const m of matchs) {
    if (m.homeScore === null || m.awayScore === null) continue;

    const dom = prendre(m.homeSlug);
    const ext = prendre(m.awaySlug);

    dom.played++; ext.played++;
    dom.pointsFor += m.homeScore; dom.pointsAgainst += m.awayScore;
    ext.pointsFor += m.awayScore; ext.pointsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) { dom.won++; ext.lost++; dom.points += VICTOIRE; }
    else if (m.homeScore < m.awayScore) { ext.won++; dom.lost++; ext.points += VICTOIRE; }
    else { dom.drawn++; ext.drawn++; dom.points += NUL; ext.points += NUL; }

    for (const [cote, b] of [[dom, m.bonus?.home], [ext, m.bonus?.away]]) {
      if (b?.o) { cote.bonusOff++; cote.points++; }
      if (b?.d) { cote.bonusDef++; cote.points++; }
    }
  }
  return t;
}

/**
 * Points terrain marques entre les seules equipes a egalite. C'est le premier
 * departage officiel ; on l'applique avant la difference generale.
 */
function pointsEntreEux(slugs, matchs) {
  const dans = new Set(slugs);
  const acc = Object.fromEntries(slugs.map((s) => [s, 0]));
  for (const m of matchs) {
    if (m.homeScore === null || !dans.has(m.homeSlug) || !dans.has(m.awaySlug)) continue;
    if (m.homeScore > m.awayScore) acc[m.homeSlug] += VICTOIRE;
    else if (m.homeScore < m.awayScore) acc[m.awaySlug] += VICTOIRE;
    else { acc[m.homeSlug] += NUL; acc[m.awaySlug] += NUL; }
    if (m.bonus?.home?.o) acc[m.homeSlug]++;
    if (m.bonus?.home?.d) acc[m.homeSlug]++;
    if (m.bonus?.away?.o) acc[m.awaySlug]++;
    if (m.bonus?.away?.d) acc[m.awaySlug]++;
  }
  return acc;
}

function computeTable(matchs) {
  const lignes = [...agreger(matchs).values()].map((r) => ({
    ...r,
    diff: r.pointsFor - r.pointsAgainst,
    // La LNR ne publie pas le nombre d'essais dans ses pages serveur. On rend
    // le champ explicitement nul plutot que de l'omettre : l'affichage peut
    // ainsi montrer un tiret assume au lieu d'une case vide inexplicable.
    triesFor: null,
    triesAgainst: null,
  }));

  // Regroupement par total de points : le departage ne s'applique qu'entre
  // equipes reellement a egalite.
  const parPoints = new Map();
  for (const l of lignes) {
    if (!parPoints.has(l.points)) parPoints.set(l.points, []);
    parPoints.get(l.points).push(l);
  }
  const h2h = new Map();
  for (const [pts, groupe] of parPoints) {
    if (groupe.length < 2) continue;
    const acc = pointsEntreEux(groupe.map((x) => x.slug), matchs);
    for (const [slug, v] of Object.entries(acc)) h2h.set(slug, v);
  }

  lignes.sort((a, b) =>
    b.points - a.points ||
    (h2h.get(b.slug) || 0) - (h2h.get(a.slug) || 0) ||
    b.diff - a.diff ||
    b.pointsFor - a.pointsFor ||
    a.slug.localeCompare(b.slug)
  );
  lignes.forEach((l, i) => { l.rank = i + 1; });
  return lignes;
}

module.exports = { computeTable, agreger, VICTOIRE, NUL };
