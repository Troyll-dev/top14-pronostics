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

export default function MiseAJour() {
  const {
    needRefresh: [aBesoin, setABesoin],
    updateServiceWorker,
  } = useRegisterSW({
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
