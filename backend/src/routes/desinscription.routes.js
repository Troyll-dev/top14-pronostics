const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { ACTIONS, verifier, appliquer } = require('../services/desinscription.service');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * La page de desinscription, servie par le serveur lui-meme.
 *
 * Pas de page React, et c'est un choix. Cette page doit fonctionner pour
 * quelqu'un qui ne se connecte plus, depuis un courriel vieux de trois mois,
 * et meme un jour ou le frontend serait indisponible. Une page autonome de
 * cent lignes, sans dependance ni script, ne peut pratiquement pas tomber en
 * panne.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi un bouton, et pas un simple clic
 * ---------------------------------------------------------------------------
 *
 * Beaucoup de messageries — Gmail, les antivirus d'entreprise, les
 * previsualisations de liens — visitent silencieusement les adresses contenues
 * dans un courriel pour les verifier, parfois avant meme que le message soit
 * ouvert. Un lien qui agirait a la simple visite desinscrirait donc des gens
 * qui n'ont rien clique, et ils ne le sauraient jamais.
 *
 * D'ou la regle, qui est celle du web depuis toujours mais qu'on oublie
 * souvent ici : une adresse qu'on visite ne modifie rien, seul un envoi de
 * formulaire le fait. La machine peut ouvrir la page ; elle n'appuiera pas sur
 * le bouton.
 */

// Ce routeur recoit un formulaire HTML, pas du JSON. Le decodage est pose ici
// plutot que sur toute l'application : c'est le seul endroit qui en a besoin.
router.use(express.urlencoded({ extended: false }));

/* --------------------------------------------------------------------------
   La mise en page
   -------------------------------------------------------------------------- */

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/**
 * Les couleurs suivent le reglage du systeme, et non celui du site : la
 * personne qui ouvre cette page n'est pas connectee, donc son theme est
 * inconnu. `prefers-color-scheme` est la seule information disponible.
 */
function page({ titre, corps }) {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${echapper(titre)} — Top 14 Pronos</title>
<style>
  :root { --fond:#f0ece0; --papier:#fbf8ec; --bord:#e3dcc6; --encre:#1c1917; --doux:#6b6355; --vert:#14532d; }
  @media (prefers-color-scheme: dark) {
    :root { --fond:#0f172a; --papier:#1e293b; --bord:#334155; --encre:#f1f5f9; --doux:#94a3b8; --vert:#4ade80; }
  }
  body {
    margin:0; padding:32px 16px 64px; background:var(--fond); color:var(--encre);
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased; line-height:1.6;
  }
  .carte {
    max-width:520px; margin:0 auto; background:var(--papier);
    border:1px solid var(--bord); border-radius:14px; padding:26px 26px 30px;
  }
  .surtitre { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--doux); margin:0 0 8px; font-weight:700; }
  h1 { font-size:21px; line-height:1.25; margin:0 0 14px; }
  p { margin:0 0 14px; font-size:15px; }
  .doux { color:var(--doux); font-size:13.5px; }
  button {
    display:inline-block; border:0; border-radius:8px; padding:12px 22px;
    background:var(--vert); color:#f7f4e9; font:inherit; font-weight:700; cursor:pointer;
  }
  @media (prefers-color-scheme: dark) { button { color:#0f172a; } }
  button.discret { background:transparent; color:var(--doux); text-decoration:underline; padding:12px 4px; font-weight:400; }
  .actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
  a { color:var(--doux); }
</style>
</head><body>
  <div class="carte">
    <p class="surtitre">🏉 Top 14 Pronos</p>
    ${corps}
  </div>
</body></html>`;
}

const erreur = (res, titre, message) =>
  res.status(400).send(
    page({
      titre,
      corps: `<h1>${echapper(titre)}</h1><p>${echapper(message)}</p>
              <p class="doux">Si tu voulais te désinscrire, réponds simplement à l'un de nos courriels : c'est un jeu entre amis, quelqu'un s'en occupera.</p>`,
    })
  );

/* --------------------------------------------------------------------------
   Lecture du lien : on montre, on ne fait rien
   -------------------------------------------------------------------------- */

router.get('/', async (req, res) => {
  const id = Number(req.query.u);
  const action = String(req.query.a || '');
  const def = ACTIONS[action];

  if (!Number.isInteger(id) || !def || !verifier(id, action, req.query.s)) {
    return erreur(res, 'Ce lien n\'est plus valable', 'Il est incomplet, ou il a été modifié en chemin.');
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (!user) return erreur(res, 'Compte introuvable', 'Ce compte n\'existe plus.');

  res.send(
    page({
      titre: def.libelle,
      corps: `
        <h1>${echapper(def.libelle)}</h1>
        <p>Salut ${echapper(user.username)}. Confirme, et c'est réglé.</p>
        <p class="doux">${echapper(def.confirme)}</p>
        <form method="post" action="/api/desinscription">
          <input type="hidden" name="u" value="${id}">
          <input type="hidden" name="a" value="${echapper(action)}">
          <input type="hidden" name="s" value="${echapper(req.query.s)}">
          <div class="actions"><button type="submit">Confirmer</button></div>
        </form>`,
    })
  );
});

/* --------------------------------------------------------------------------
   Envoi du formulaire : la seule voie qui modifie quelque chose
   -------------------------------------------------------------------------- */

router.post('/', async (req, res) => {
  const id = Number(req.body.u);
  const action = String(req.body.a || '');
  const annuler = req.body.annuler === '1';
  const def = ACTIONS[action];

  if (!Number.isInteger(id) || !def || !verifier(id, action, req.body.s)) {
    return erreur(res, 'Ce lien n\'est plus valable', 'Il est incomplet, ou il a été modifié en chemin.');
  }

  try {
    await appliquer(id, action, { annuler });
  } catch (err) {
    console.error('[desinscription] echec :', err.message);
    return erreur(res, 'Ça n\'a pas marché', 'Le serveur n\'a pas pu enregistrer ta demande. Réessaie dans un instant.');
  }

  const site = (process.env.APP_URL || '').replace(/\/$/, '');

  // Le retour en arriere est propose immediatement, et non renvoye au profil :
  // un clic part parfois de travers, et il ne faut pas qu'une erreur de doigt
  // coute une connexion et une recherche de reglage.
  const corps = annuler
    ? `<h1>C'est revenu comme avant</h1>
       <p>Tes réglages sont rétablis. Rien n'avait été effacé de toute façon.</p>
       ${site ? `<p class="doux"><a href="${site}">Retourner au jeu</a></p>` : ''}`
    : `<h1>C'est fait</h1>
       <p>${echapper(def.confirme)}</p>
       <form method="post" action="/api/desinscription">
         <input type="hidden" name="u" value="${id}">
         <input type="hidden" name="a" value="${echapper(action)}">
         <input type="hidden" name="s" value="${echapper(req.body.s)}">
         <input type="hidden" name="annuler" value="1">
         <div class="actions">
           <button type="submit" class="discret">Annuler, c'était une erreur</button>
         </div>
       </form>
       ${site ? `<p class="doux">Tu peux revenir sur ce choix à tout moment depuis ton profil, sur <a href="${site}">le site</a>.</p>` : ''}`;

  res.send(page({ titre: annuler ? 'Rétabli' : 'C\'est fait', corps }));
});

module.exports = router;
