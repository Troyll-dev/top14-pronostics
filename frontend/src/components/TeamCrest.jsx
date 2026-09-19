import { useId } from 'react';

/**
 * Ecussons dessines, aux couleurs de chaque club.
 * Ce ne sont pas les blasons officiels : forme et partition sont originales.
 *
 * Trois clubs partagent le rouge et noir et cinq le bleu et blanc, d'ou la
 * partition heraldique differente pour chacun — parti, fasce, bande ou chevron.
 *
 * cle    : shortName tel qu'il est en base
 * label  : monogramme affiche (si different du shortName)
 * c1/c2  : couleurs du club
 * tx     : couleur du monogramme (cerne d'un filet noir : sur un ecusson
 *          bicolore aucune couleur unie ne contraste avec les deux moities,
 *          c'est le filet qui assure la lisibilite — comme sur un maillot)
 * div    : partition de l'ecusson
 */
export const CLUBS = {
  TLS:  { c1: '#E4032E', c2: '#101010', tx: '#FFFFFF', div: 'parti'   },
  UBB:  { c1: '#8C1D40', c2: '#002855', tx: '#FFFFFF', div: 'parti'   },
  SR:   { c1: '#FFD100', c2: '#101010', tx: '#FFFFFF', div: 'parti'   },
  RCT:  { c1: '#D6001C', c2: '#101010', tx: '#FFFFFF', div: 'fasce'   },
  LOU:  { c1: '#C8102E', c2: '#101010', tx: '#FFFFFF', div: 'bande'   },
  ASM:  { c1: '#FFD400', c2: '#002D62', tx: '#FFFFFF', div: 'parti'   },
  SFP:  { c1: '#F04E98', c2: '#0B2265', tx: '#FFFFFF', div: 'parti'   },
  R92:  { c1: '#8ECFEC', c2: '#FFFFFF', tx: '#0B2B3C', div: 'parti'   },
  CAO:  { c1: '#0069B4', c2: '#FFFFFF', tx: '#FFFFFF', div: 'fasce', label: 'CO' },
  CO:   { c1: '#0069B4', c2: '#FFFFFF', tx: '#FFFFFF', div: 'fasce'   },
  AB:   { c1: '#00A3E0', c2: '#FFFFFF', tx: '#FFFFFF', div: 'bande'   },
  PAU:  { c1: '#00693E', c2: '#FFFFFF', tx: '#FFFFFF', div: 'parti'   },
  MHR:  { c1: '#0033A0', c2: '#FFFFFF', tx: '#FFFFFF', div: 'parti'   },
  USAP: { c1: '#C8102E', c2: '#FFC72C', tx: '#FFFFFF', div: 'parti'   },
  RCV:  { c1: '#12325C', c2: '#FFFFFF', tx: '#FFFFFF', div: 'chevron' },
};

const NEUTRAL = { c1: '#4A5C50', c2: '#2C3A31', tx: '#FFFFFF', div: 'parti' };

const SHIELD = 'M 3 2 H 45 V 30 C 45 42 37 50 24 55 C 11 50 3 42 3 30 Z';

function Division({ div, c1, c2 }) {
  if (div === 'fasce') {
    return (
      <>
        <rect width="48" height="56" fill={c2} />
        <rect y="0" width="48" height="14" fill={c1} />
        <rect y="28" width="48" height="14" fill={c1} />
      </>
    );
  }
  if (div === 'bande') {
    return (
      <>
        <rect width="48" height="56" fill={c2} />
        <path d="M -10 42 L 34 -8 L 58 14 L 14 64 Z" fill={c1} />
      </>
    );
  }
  if (div === 'chevron') {
    return (
      <>
        <rect width="48" height="56" fill={c2} />
        <path d="M 24 6 L 52 34 L 52 60 L -4 60 L -4 34 Z" fill={c1} />
      </>
    );
  }
  return (
    <>
      <rect x="0" y="0" width="24" height="56" fill={c1} />
      <rect x="24" y="0" width="24" height="56" fill={c2} />
    </>
  );
}

/**
 * @param {object} team   l'equipe (shortName, name, logo)
 * @param {number} size   largeur en pixels (la hauteur suit le ratio du bouclier)
 */
export default function TeamCrest({ team, size = 28, className = '' }) {
  const uid = useId();
  if (!team) return null;

  // Si une image a ete renseignee en base, elle prime sur l'ecusson dessine
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        width={size}
        height={size}
        className={`object-contain shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }

  const conf = CLUBS[team.shortName] || NEUTRAL;
  const label = conf.label || team.shortName || '?';
  const clipId = `crest-${uid}`;

  // Le monogramme retrecit quand il depasse trois caracteres (USAP)
  const fontSize = label.length >= 4 ? 13 : label.length === 3 ? 16 : 19;

  return (
    <svg
      width={size}
      height={(size * 56) / 48}
      viewBox="0 0 48 56"
      role="img"
      aria-label={team.name}
      className={`shrink-0 ${className}`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <Division div={conf.div} c1={conf.c1} c2={conf.c2} />
      </g>
      <path d={SHIELD} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="2.5" />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Bitter, Georgia, serif"
        fontWeight="800"
        fontSize={fontSize}
        fill={conf.tx}
        stroke="rgba(0,0,0,.8)"
        strokeWidth="2"
        paintOrder="stroke"
      >
        {label}
      </text>
    </svg>
  );
}
