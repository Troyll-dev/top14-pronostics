/**
 * Les deux blocs d'equipe d'une feuille : lequel est le recevant ?
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON SAIT DEJA
 * ---------------------------------------------------------------------------
 *
 * La bonne feuille est telechargee pour la bonne rencontre — verifie. Son
 * en-tete annonce correctement qui recoit — verifie. Et pourtant, a la J6, les
 * quinze de Lyon et de La Rochelle sont ranges a l'envers l'un de l'autre,
 * tandis que Pau–Castres est a l'endroit.
 *
 * Il ne reste qu'un endroit possible. L'analyseur attribue le premier bloc
 * `line-up__classic-team` au recevant et le second au visiteur :
 *
 *     const home = equipes[0] ...
 *     const away = equipes[1] ...
 *
 * C'est une hypothese sur l'ordre d'ecriture de la page. Si elle est fausse
 * pour certaines rencontres, on obtient exactement ce melange — et le garde-fou
 * n'y voit rien, puisqu'il controle un nom lu ailleurs, dans l'en-tete, qui lui
 * reste juste.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT CHERCHE
 * ---------------------------------------------------------------------------
 *
 * Non pas « l'ordre est-il bon », mais « de quoi dispose-t-on dans la page pour
 * ne plus avoir a le supposer ». Pour chaque bloc d'equipe il affiche ses
 * premieres lignes debarrassees de leurs balises, et cherche si le nom ou le
 * slug d'un des deux clubs y figure.
 *
 * Si un bloc se nomme lui-meme, le correctif est evident et definitif : on lit
 * le nom au lieu de compter sur la position. Si aucun ne se nomme, il faudra
 * une autre preuve, et les premieres lignes montreront laquelle.
 *
 * On lit deux feuilles choisies : une dont on sait qu'elle est a l'envers en
 * base, une dont on sait qu'elle est a l'endroit. Comparer les deux est ce qui
 * revele la difference — une seule ne prouverait rien.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/lnr-blocs.js
 *   node scripts/lnr-blocs.js 2026-2027/j6/11856-lyon-la-rochelle
 *
 * Lecture seule. Aucune base ouverte, aucune ecriture.
 */

const axios = require('axios');
const compos = require('../src/services/sources/lnr-compositions');

const SEASON = process.env.LNR_SEASON || '2026-2027';
const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';

/*
 * Les deux temoins.
 *
 * lyon-la-rochelle : les deux quinze sont intervertis en base.
 * pau-castres      : la seule rencontre de la J6 trouvee a l'endroit.
 */
const TEMOINS = process.argv[2]
  ? [process.argv[2]]
  : [
      `feuille-de-match/${SEASON}/j6/11856-lyon-la-rochelle`,
      `feuille-de-match/${SEASON}/j6/11858-pau-castres`,
    ];

/** Le texte visible d'un fragment de HTML, sans les balises ni les blancs. */
const texte = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Les attributs de la balise ouvrante d'un bloc : c'est la que tout se joue. */
const baliseOuvrante = (html) => {
  const m = /^<[^>]{0,600}>/.exec(String(html || '').replace(/^[\s\S]*?(?=<)/, ''));
  return m ? m[0] : '(introuvable)';
};

(async () => {
  for (const chemin of TEMOINS) {
    const url = `${BASE}/${chemin}/compositions`;
    console.log('\n' + '='.repeat(72));
    console.log(url);
    console.log('='.repeat(72));

    let page;
    try {
      page = String((await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
      })).data);
    } catch (err) {
      console.log(`  ECHEC : ${err.message}`);
      continue;
    }

    /* -------------------------------------------------------------------- */
    /* L'en-tete : la verite sur qui recoit                                  */
    /* -------------------------------------------------------------------- */

    const lu = compos.parseCompositions(page);
    console.log(`\n  en-tete  recevant « ${lu.homeTeam} »   visiteur « ${lu.awayTeam} »`);
    console.log(`  analyseur actuel — bloc 1 : ${lu.home.titulaires.slice(0, 3).map((j) => j.nom).join(', ') || '—'}`);
    console.log(`  analyseur actuel — bloc 2 : ${lu.away.titulaires.slice(0, 3).map((j) => j.nom).join(', ') || '—'}`);

    /*
     * La balise <line-up-pitch> entiere.
     *
     * Elle porte deja home-team et away-team. Si elle porte aussi la
     * composition de chaque camp, ou un identifiant exploitable, c'est la
     * source la plus sure de la page : un attribut ne change pas d'ordre.
     */
    const pitch = /<line-up-pitch\b[\s\S]{0,2000}?>/.exec(page);
    console.log(`\n  balise <line-up-pitch> :`);
    console.log(`    ${pitch ? pitch[0].slice(0, 700) : '(introuvable)'}`);

    /* -------------------------------------------------------------------- */
    /* Les blocs d'equipe, un par un                                         */
    /* -------------------------------------------------------------------- */

    const marques = [];
    const re = /class="line-up__classic-team([^"]*)"/g;
    let m;
    while ((m = re.exec(page))) {
      if (marques.length && m.index - marques[marques.length - 1].pos < 40) {
        marques[marques.length - 1].officiels = true;
        continue;
      }
      marques.push({ pos: m.index, officiels: /--officials/.test(m[1]) });
    }

    console.log(`\n  ${marques.length} blocs trouves\n`);

    marques.forEach((x, i) => {
      const html = page.slice(x.pos, marques[i + 1] ? marques[i + 1].pos : page.length);
      const debut = page.slice(Math.max(0, x.pos - 400), x.pos + 600);

      console.log('  ' + '-'.repeat(68));
      console.log(`  BLOC ${i + 1}${x.officiels ? '  (officiels)' : ''}   position ${x.pos}`);
      console.log('  ' + '-'.repeat(68));

      // Le nom d'un des deux clubs apparait-il dans le bloc ?
      for (const nom of [lu.homeTeam, lu.awayTeam].filter(Boolean)) {
        const dedans = html.slice(0, 3000).includes(nom);
        console.log(`    contient « ${nom} » dans ses 3000 premiers caracteres : ${dedans ? 'OUI' : 'non'}`);
      }

      // Et un slug de club, dans un lien ou un nom de fichier d'ecusson ?
      const slugs = [...new Set((html.slice(0, 3000).match(/\/club\/([a-z0-9-]+)/g) || []).map((s) => s.split('/').pop()))];
      console.log(`    slugs de club reperes : ${slugs.length ? slugs.join(', ') : 'aucun'}`);

      console.log(`\n    les 400 caracteres qui PRECEDENT le bloc, en texte :`);
      console.log(`      ${texte(debut.slice(0, 400)).slice(0, 220) || '(vide)'}`);

      console.log(`\n    balise ouvrante :`);
      console.log(`      ${baliseOuvrante(html).slice(0, 300)}`);

      console.log(`\n    texte du bloc, debut :`);
      console.log(`      ${texte(html).slice(0, 220)}`);
      console.log('');
    });

    await new Promise((r) => setTimeout(r, 700));
  }

  console.log(`
========================================================================
CE QU'IL FAUT Y CHERCHER
========================================================================

  Un bloc qui se nomme — par le nom du club, un slug, un ecusson, un
  attribut — est la reponse : on lira ce nom au lieu de compter sur l'ordre,
  et l'interversion deviendra impossible, quel que soit l'ordre choisi par
  la LNR.

  Si aucun des deux ne se nomme, il reste la balise <line-up-pitch> : elle
  porte deja home-team et away-team, et peut-etre les joueurs de chaque camp.
  Un seul nom commun entre le terrain et un bloc suffirait alors a trancher.

  Et si rien de tout cela n'existe, comparer les deux temoins dira au moins
  si l'ordre suit une regle — le classement, l'ordre alphabetique, le hasard.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
