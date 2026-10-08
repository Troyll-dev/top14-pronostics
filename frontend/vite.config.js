import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * L'application installable.
 *
 * Le plugin fabrique deux choses au moment du `build` : le manifeste, qui dit au
 * telephone comment nommer et dessiner l'icone une fois l'appli posee sur
 * l'ecran d'accueil, et un service worker, qui garde en cache ce qu'il faut pour
 * que l'appli s'ouvre instantanement et survive a une mauvaise connexion dans un
 * stade.
 *
 * ---------------------------------------------------------------------------
 * Ce qui est mis en cache, et surtout ce qui ne l'est pas
 * ---------------------------------------------------------------------------
 *
 * `globPatterns` ne retient que la coquille : le HTML, le JavaScript et les
 * feuilles de style. Les images en sont volontairement exclues — les bandeaux et
 * les photos pesent plus d'un mega a eux seuls, et les precharger imposerait ce
 * telechargement a chaque joueur des la premiere visite, pour un confort dont il
 * n'a peut-etre pas besoin. Le navigateur les gardera de lui-meme apres le
 * premier affichage.
 *
 * Les appels a l'API ne sont mis en cache nulle part, et c'est le point le plus
 * important de ce fichier. Une reponse servie depuis un cache afficherait un
 * classement d'il y a trois jours ou un pronostic qu'on croyait avoir change :
 * sur une application dont tout l'interet est de dire ou l'on en est, c'est pire
 * qu'une page qui refuse de se charger. `navigateFallbackDenylist` ecarte donc
 * `/api` du repli hors ligne, et aucune regle de cache ne vise cette route.
 *
 * Les polices Google, elles, sont mises en cache pour de bon : elles ne changent
 * jamais, et sans elles l'appli s'ouvre hors ligne avec la police du systeme,
 * ce qui se voit immediatement.
 *
 * ---------------------------------------------------------------------------
 * La mise a jour
 * ---------------------------------------------------------------------------
 *
 * `registerType: 'prompt'` et non `autoUpdate`. C'est le choix qui distingue une
 * application installable agreable d'une qui attire des reproches le samedi
 * midi : avec la mise a jour automatique, un joueur peut rester bloque sur une
 * ancienne version sans comprendre pourquoi son pronostic ne part pas. Ici une
 * nouvelle version se signale par un bandeau — voir `MiseAJour.jsx` — et c'est
 * le joueur qui recharge, au moment ou ca ne le derange pas.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Top 14 Pronostics',
        short_name: 'Top 14 Pronos',
        description: 'Les pronostics du Top 14, entre copains.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#014224',
        theme_color: '#014224',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android recadre les icones selon la forme choisie par l'utilisateur —
          // rond, carre arrondi, goutte. Ces deux-la ont le dessin reduit a 80 %
          // pour qu'aucun rognage ne morde dessus.
          { src: '/icone-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'polices',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Le service worker ne tourne pas en developpement : sinon chaque
        // modification se heurterait a un cache, et l'on passerait son temps a
        // vider le navigateur en croyant que le code ne marche pas.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
