import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Le bandeau de mise a jour.
 *
 * C'est la contrepartie du cache, et ce n'est pas une option.
 *
 * Une application installable demarre instantanement parce qu'elle sert d'abord
 * ce qu'elle a garde. L'envers, c'est qu'un joueur peut rester sur une ancienne
 * version apres un deploiement : son ecran a l'air normal, mais son pronostic
 * part vers une route qui n'existe plus, ou son joker se pose dans une interface
 * qu'on a changee. Il ne voit qu'une chose : ca ne marche pas.
 *
 * On ne recharge pas pour lui. Un rechargement impose en pleine saisie ferait
 * perdre les scores en cours de frappe, ce qui est exactement le reproche qu'on
 * cherche a eviter. On signale, il decide.
 *
 * `onNeedRefresh` se declenche quand une nouvelle version est prete a prendre la
 * main. `updateServiceWorker(true)` l'active et recharge la page.
 *
 * ---------------------------------------------------------------------------
 * QUI POSE LA QUESTION, ET QUAND
 * ---------------------------------------------------------------------------
 *
 * Un service worker ne surveille rien. Le navigateur ne demande « y a-t-il une
 * nouvelle version ? » qu'au moment de l'enregistrement, c'est-a-dire au
 * chargement de la page. Tant que l'application reste ouverte, personne ne pose
 * la question et le bandeau ne peut pas apparaitre, meme si le deploiement date
 * d'une heure. C'est ce qui obligeait a fermer l'appli et a la rouvrir pour la
 * voir s'annoncer — comportement par defaut, et pas un defaut de cette page.
 *
 * iOS l'accentue : une application posee sur l'ecran d'accueil est gelee des
 * qu'elle passe en arriere-plan, et reprend exactement ou elle en etait. Elle
 * peut donc rester des jours sans jamais se recharger.
 *
 * `onRegisteredSW` nous donne l'enregistrement, et `registration.update()` pose
 * la question quand on veut. On la pose a deux moments :
 *
 *   au retour au premier plan — c'est le cas d'usage reel, on pousse depuis
 *   l'ordinateur puis on reprend le telephone ;
 *
 *   une fois par heure si l'appli reste ouverte, pour le samedi apres-midi ou
 *   elle ne quitte pas l'ecran.
 *
 * Deux garde-fous. On ne demande rien si l'onglet n'est pas visible : la
 * question couterait une requete pour un bandeau que personne ne verrait. Et on
 * ne demande rien hors ligne, ou l'appel echouerait de toute facon — c'est
 * precisement la situation que le cache est la pour couvrir.
 *
 * L'echec est avale sans bruit : ne pas savoir s'il existe une nouvelle version
 * n'empeche rien, l'ancienne continue de fonctionner.
 *
 * Deux details de style qui ne se devinent pas. Les couleurs sont ecrites en
 * clair plutot qu'en classes de palette : ce bandeau se pose sur un aplat de
 * couleur fixe, et les classes du projet basculent avec le theme — on aurait de
 * l'encre sombre sur fond sombre une fois sur deux. Et la marge basse ajoute
 * `env(safe-area-inset-bottom)`, sans quoi le bandeau se glisse sous la barre
 * de navigation de l'iPhone.
 */

const CADRE = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  background: '#1c2a1f',
  color: '#f1f5f9',
  border: '1px solid #2f4a36',
  borderRadius: 10,
  padding: '12px 14px',
  boxShadow: '0 10px 30px -12px rgba(0,0,0,.6)',
  fontSize: 13.5,
  lineHeight: 1.45,
};

const BOUTON = {
  background: '#f59e0b',
  color: '#0b1020',
  border: 'none',
  borderRadius: 6,
  padding: '7px 14px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const PLUS_TARD = {
  background: 'transparent',
  color: '#94a3b8',
  border: 'none',
  padding: '7px 4px',
  fontSize: 12.5,
  cursor: 'pointer',
  textDecoration: 'underline',
  whiteSpace: 'nowrap',
};

/** Une heure : assez rare pour ne rien peser, assez frequent pour un samedi. */
const INTERVALLE_MS = 60 * 60 * 1000;

export default function MiseAJour() {
  const {
    needRefresh: [aBesoin, setABesoin],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, registration) {
      if (!registration) return;

      const demander = () => {
        if (document.visibilityState !== 'visible') return;
        if (navigator.onLine === false) return;
        registration.update().catch(() => {
          // Hors ligne, serveur injoignable, deploiement en cours : on reessaiera
          // au prochain retour au premier plan.
        });
      };

      // Au retour au premier plan, et une fois par heure si l'appli y reste.
      // Ni l'un ni l'autre n'est retire : ce composant est monte une fois pour
      // toute la duree de vie de l'application, il n'y a rien a nettoyer.
      document.addEventListener('visibilitychange', demander);
      setInterval(demander, INTERVALLE_MS);
    },
    onRegisterError(err) {
      // Un service worker qui ne s'enregistre pas n'empeche pas l'appli de
      // fonctionner : elle perd le demarrage instantane, rien d'autre. On le
      // note sans rien montrer au joueur.
      console.error('[pwa]', err);
    },
  });

  if (!aBesoin) return null;

  return (
    <div style={CADRE} role="status">
      <span style={{ flex: 1, minWidth: 180 }}>
        Une nouvelle version est disponible.
      </span>
      <button type="button" style={BOUTON} onClick={() => updateServiceWorker(true)}>
        Recharger
      </button>
      <button type="button" style={PLUS_TARD} onClick={() => setABesoin(false)}>
        plus tard
      </button>
    </div>
  );
}
