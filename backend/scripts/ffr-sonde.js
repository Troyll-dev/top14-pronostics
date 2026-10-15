/**
 * L'API de la Federation Francaise de Rugby porte-t-elle des matchs ?
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON SAIT
 * ---------------------------------------------------------------------------
 *
 * Le site de la FFR est une application construite dans le navigateur : une
 * simple requete sur ses pages ne rend rien. Mais elle s'alimente a une API
 * WordPress publique, `api.www.ffr.fr/wp-json/`, dont le catalogue annonce des
 * routes qui pourraient porter ce qu'on cherche — `competition_home`,
 * `competition_classement_inter`, `blocks_mini_calendrier_matchs`.
 *
 * Aucune n'est documentee, et le nom d'une route ne dit pas ce qu'elle rend. Ce
 * script le demande, pour chacune, et resume la reponse en quelques lignes au
 * lieu d'en deverser des milliers.
 *
 * ---------------------------------------------------------------------------
 * LA QUESTION QUI DECIDE
 * ---------------------------------------------------------------------------
 *
 * Est-ce qu'une de ces routes rend des **rencontres a venir, avec une date, deux
 * equipes et un score quand il existe** ? C'est tout ce dont l'application a
 * besoin. Le reste — actualites, clubs, offres d'emploi, billetterie — ne nous
 * sert a rien, et une API riche en contenu editorial peut parfaitement etre
 * pauvre en donnees sportives.
 *
 * Et il faut garder en tete que la FFR est la federation francaise : elle
 * publie le XV de France, soit cinq rencontres sur les quinze du Tournoi. Meme
 * si tout fonctionne, il manquera les dix autres.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/ffr-sonde.js
 *   node scripts/ffr-sonde.js --brut      (ajoute un extrait de la reponse)
 *
 * Lecture seule, rien n'est ecrit, la base n'est pas ouverte. Une dizaine de
 * requetes espacees d'une demi-seconde.
 */

const axios = require('axios');

const BASE = 'https://api.www.ffr.fr/wp-json';
const BRUT = process.argv.includes('--brut');
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Les candidates.
 *
 * Relevees dans le catalogue de l'API et dans ce que le site appelle lui-meme.
 * On essaie aussi quelques noms de types de contenu WordPress : un site qui
 * publie des rencontres les range presque toujours dans un type dedie, et
 * `wp/v2/types` dit lesquels existent sans avoir a deviner.
 */
const ROUTES = [
  ['le catalogue des types de contenu', '/wp/v2/types'],
  ['accueil competitions', '/ffr/v1/competition_home'],
  ['accueil competitions + vainqueur', '/ffr/v1/competition_home_with_winner'],
  ['classement international', '/ffr/v1/competition_classement_inter'],
  ['arbitres des competitions', '/ffr/v1/competition_arbitres'],
  ['mini calendrier (sans parametres)', '/ffr/v1/blocks_mini_calendrier_matchs'],
  ['type de contenu « matchs »', '/wp/v2/matchs?per_page=3'],
  ['type de contenu « match »', '/wp/v2/match?per_page=3'],
  ['type de contenu « rencontres »', '/wp/v2/rencontres?per_page=3'],
  ['recherche « six nations »', '/wp/v2/search?search=six%20nations&per_page=5'],
];

/** Les clefs d'un objet, ou la forme d'un tableau : de quoi reconnaitre une rencontre. */
function forme(x, profondeur = 0) {
  if (x === null) return 'null';
  if (Array.isArray(x)) {
    if (!x.length) return 'tableau vide';
    return `tableau de ${x.length} — premier element : ${forme(x[0], profondeur + 1)}`;
  }
  if (typeof x === 'object') {
    const clefs = Object.keys(x);
    if (profondeur > 1) return `objet (${clefs.length} champs)`;
    return `{ ${clefs.slice(0, 18).join(', ')}${clefs.length > 18 ? ', …' : ''} }`;
  }
  return typeof x;
}

/**
 * Est-ce que ca ressemble a une rencontre ?
 *
 * On cherche, dans le texte brut de la reponse, les mots qui accompagnent
 * toujours un match et presque jamais un article : une date, deux camps, un
 * score. C'est grossier, et c'est voulu — il s'agit de reperer ou creuser, pas
 * de conclure.
 */
function indices(texte) {
  const mots = [
    'kickoff', 'coup_envoi', 'date_match', 'dateMatch',
    'equipe_domicile', 'equipeDomicile', 'home', 'away', 'visiteur',
    'score', 'resultat', 'adversaire', 'stade', 'competition',
    'six nations', 'tournoi', 'xv de france',
  ];
  const t = texte.toLowerCase();
  return mots.filter((m) => t.includes(m.toLowerCase()));
}

(async () => {
  console.log(`\n${BASE}\n`);
  console.log('='.repeat(72));

  for (const [libelle, chemin] of ROUTES) {
    const url = `${BASE}${chemin}`;
    process.stdout.write(`\n${libelle}\n  ${chemin}\n`);

    try {
      const res = await axios.get(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
        validateStatus: () => true,
        maxContentLength: 20 * 1024 * 1024,
      });

      const taille = JSON.stringify(res.data || '').length;
      console.log(`  statut ${res.status}  ·  ${taille.toLocaleString('fr-FR')} caracteres`);

      if (res.status >= 400) {
        const msg = res.data && (res.data.message || res.data.code);
        console.log(`  ${msg || 'refuse'}`);
        continue;
      }

      console.log(`  forme : ${forme(res.data)}`);

      /*
       * Le catalogue des types merite un traitement a part : c'est lui qui dit
       * si un type « match » existe, et sous quel nom exact. Le deviner coute
       * une requete par essai ; le lire coute une requete pour tous.
       */
      if (chemin === '/wp/v2/types' && res.data && typeof res.data === 'object') {
        const noms = Object.keys(res.data);
        console.log(`  types publies : ${noms.join(', ')}`);
        const sportifs = noms.filter((n) => /match|rencontre|competition|equipe|calendrier/i.test(n));
        console.log(`  ceux qui nous interessent : ${sportifs.length ? sportifs.join(', ') : 'aucun'}`);
        continue;
      }

      const texte = JSON.stringify(res.data);
      const trouves = indices(texte);
      console.log(`  indices de rencontre : ${trouves.length ? trouves.join(', ') : 'aucun'}`);

      if (BRUT) {
        console.log(`  extrait : ${texte.slice(0, 600)}${texte.length > 600 ? '…' : ''}`);
      }
    } catch (err) {
      console.log(`  ECHEC : ${err.message}`);
    }

    await dors(500);
  }

  console.log(`

${'='.repeat(72)}
CE QU'IL FAUT Y LIRE
${'='.repeat(72)}

  Une route qui rend un tableau d'objets portant une date et deux equipes est
  une source. Tout le reste — des articles, des images, des clubs — n'en est
  pas une, quel que soit son nom.

  Si « types publies » contient un type dedie aux rencontres, c'est la qu'il
  faut aller, et on relancera la sonde sur lui.

  Et si rien ne porte de match : la FFR publie son agenda autrement que par
  cette API, et il faudra choisir entre une autre source et la saisie a la
  main. Quinze lignes connues depuis mars, ce n'est pas une defaite.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
