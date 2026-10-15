/**
 * La FFR publie-t-elle ses rencontres AVANT qu'elles soient jouees ?
 *
 * ---------------------------------------------------------------------------
 * LA SEULE QUESTION QUI RESTE
 * ---------------------------------------------------------------------------
 *
 * On sait maintenant ce que porte `/wp/v2/rencontres_itl` : une date, un
 * adversaire, qui recoit, les deux scores, le lieu, l'arbitre, et la
 * composition complete poste par poste. C'est tout ce qu'il faut, et davantage.
 *
 * Mais les cinq elements qu'on a lus sont tous des rencontres passees, et c'est
 * l'ordre de publication qui le voulait. Si la FFR ne cree la fiche qu'une fois
 * le match joue, cette source est un livre d'histoire : excellente pour
 * alimenter des statistiques, inutile pour faire pronostiquer, puisqu'il
 * faudrait la rencontre avant le coup d'envoi.
 *
 * Le test tombe bien. La tournee d'automne se joue dans quelques semaines :
 * les fiches existent deja, ou elles n'existent pas.
 *
 * ---------------------------------------------------------------------------
 * ET OU SE TROUVE LE TOURNOI
 * ---------------------------------------------------------------------------
 *
 * Le second volet liste les competitions de type `tournois_VI_nations`. On y
 * verra si l'edition 2027 est declaree, sous quel identifiant, et avec quel
 * statut — c'est par cet identifiant que les rencontres s'y rattachent
 * (`competitionId`), donc c'est la clef de toute collecte future.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/ffr-sonde3.js
 *
 * Lecture seule. Quelques requetes, aucune ecriture.
 */

const axios = require('axios');

const BASE = 'https://api.www.ffr.fr/wp-json';
const AUJOURD_HUI = new Date();

const get = async (chemin) =>
  axios.get(`${BASE}${chemin}`, {
    timeout: 40000,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
    validateStatus: () => true,
    maxContentLength: 80 * 1024 * 1024,
  });

const court = (s, n) => String(s ?? '').slice(0, n).padEnd(n);

(async () => {
  /* ---------------------------------------------------------------------- */
  /* 1. Les competitions du Tournoi                                          */
  /* ---------------------------------------------------------------------- */

  console.log('\n' + '='.repeat(74));
  console.log('LES COMPETITIONS DE TYPE « TOURNOI DES SIX NATIONS »');
  console.log('='.repeat(74));

  const comps = [];
  for (const page of [1, 2]) {
    const r = await get(`/wp/v2/competitions?per_page=100&page=${page}&orderby=date&order=desc`);
    if (r.status >= 400 || !Array.isArray(r.data)) break;
    comps.push(...r.data);
    if (r.data.length < 100) break;
  }

  console.log(`\n  ${comps.length} competitions lues\n`);

  const tournois = comps.filter((c) => /VI_nations|six.?nations/i.test(
    `${c.meta?.type_competition || ''} ${c.title?.rendered || ''}`
  ));

  if (!tournois.length) {
    console.log('  aucune competition de ce type dans les plus recentes');
  } else {
    console.log('  id       annee  equipe                      statut        debut        titre');
    console.log('  ' + '-'.repeat(104));
    for (const c of tournois) {
      const m = c.meta || {};
      console.log(
        `  ${court(c.id, 8)} ${court(m.annee, 6)} ${court(m.equipeNom, 27)} ` +
        `${court(m.statut_competition, 13)} ${court((m.start_date || '').slice(0, 10), 12)} ` +
        `${String(c.title?.rendered || '').replace(/&#8211;/g, '-').slice(0, 44)}`
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Les rencontres a venir                                               */
  /* ---------------------------------------------------------------------- */

  console.log('\n' + '='.repeat(74));
  console.log('LES RENCONTRES NON ENCORE JOUEES');
  console.log('='.repeat(74));
  console.log(`
  On lit les fiches les plus recemment publiees et on garde celles dont la
  date de rencontre est devant nous. Une seule suffit a repondre : si la FFR
  annonce ses matchs a l'avance, la source vaut pour pronostiquer.
`);

  const rencontres = [];
  for (const page of [1, 2, 3]) {
    const r = await get(`/wp/v2/rencontres_itl?per_page=50&page=${page}&orderby=date&order=desc`);
    if (r.status >= 400 || !Array.isArray(r.data)) break;
    rencontres.push(...r.data);
    if (r.data.length < 50) break;
  }

  console.log(`  ${rencontres.length} fiches lues (les plus recemment publiees)\n`);

  const lignes = rencontres
    .map((e) => {
      const m = e.meta || {};
      const d = m.date_rencontre ? new Date(m.date_rencontre) : null;
      return { e, m, d };
    })
    .filter((x) => x.d && !Number.isNaN(x.d.getTime()))
    .sort((a, b) => a.d - b.d);

  const futures = lignes.filter((x) => x.d >= AUJOURD_HUI);

  const affiche = (x) => {
    const { m, d } = x;
    const score =
      m.france_score || m.adversaire_score
        ? `${m.france_score}-${m.adversaire_score}`
        : '  –  ';
    console.log(
      `  ${court(m.date_rencontre, 19)} ${court(m.equipeNom, 24)} ` +
      `${m.reception ? 'recoit ' : 'chez   '} ${court(m.adversaire, 20)} ` +
      `${court(score, 7)} ${m.rencontre_terminee ? 'terminee' : 'A VENIR '} comp ${m.competitionId}`
    );
  };

  if (!futures.length) {
    console.log('  AUCUNE rencontre a venir dans ces fiches.');
    console.log('  Les cinq dernieres par date, pour situer :\n');
    lignes.slice(-5).forEach(affiche);
    console.log(`
  Si la fiche la plus recente date du dernier match joue, la FFR ne publie
  qu'apres coup : la source nourrira les statistiques, pas les pronostics.
`);
  } else {
    console.log(`  ${futures.length} rencontre(s) a venir :\n`);
    futures.forEach(affiche);
    console.log(`
  La FFR annonce donc ses rencontres a l'avance. Reste a savoir combien de
  temps avant — comparer la date de publication de la fiche a la date du
  match le dira, et c'est ce qui decidera du rythme de relecture.
`);
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Quel delai entre publication et coup d'envoi                         */
  /* ---------------------------------------------------------------------- */

  console.log('='.repeat(74));
  console.log('COMBIEN DE TEMPS AVANT LE MATCH LA FICHE EST-ELLE CREEE');
  console.log('='.repeat(74));
  console.log(`
  Le delai se mesure sur les rencontres passees, et il vaut pour les futures.
  Negatif : la fiche n'existe qu'apres le match.
`);

  const delais = lignes
    .filter((x) => x.e.date)
    .map((x) => ({
      jours: Math.round((x.d - new Date(x.e.date)) / 86400000),
      quoi: `${x.m.equipeNom} – ${x.m.adversaire} (${String(x.m.date_rencontre).slice(0, 10)})`,
    }))
    .sort((a, b) => a.jours - b.jours);

  if (delais.length) {
    const med = delais[Math.floor(delais.length / 2)];
    console.log(`  le plus tot  : ${delais[delais.length - 1].jours} jours avant — ${delais[delais.length - 1].quoi}`);
    console.log(`  median       : ${med.jours} jours avant`);
    console.log(`  le plus tard : ${delais[0].jours} jours avant — ${delais[0].quoi}`);
  }

  console.log('');
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
