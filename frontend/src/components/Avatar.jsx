import { useState, useEffect } from 'react';
import api from '../api/client';

const VERSION_KEY = 't14-avatar-v';

/**
 * Jeton de cache partage. Il ne change que lorsque l'on modifie sa propre
 * photo ; les quelques images des autres joueurs sont alors relues une fois,
 * ce qui ne coute rien et evite de propager quoi que ce soit.
 */
function readVersion() {
  try {
    return parseInt(localStorage.getItem(VERSION_KEY), 10) || 0;
  } catch {
    return 0;
  }
}

export function bumpAvatarVersion() {
  const next = readVersion() + 1;
  try { localStorage.setItem(VERSION_KEY, String(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('t14-avatar-maj'));
  return next;
}

export function avatarUrl(userId, version = readVersion()) {
  const base = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  return `${base}/users/${userId}/avatar?v=${version}`;
}

/**
 * Couleur de l'initiale, choisie selon le fond.
 *
 * Elle etait ecrite en blanc en dur, ce qui marche sur des teintes soutenues
 * mais rend l'initiale invisible des qu'un joueur choisit un fond clair dans
 * le selecteur libre. On retient ici l'encre — sombre ou blanche — qui
 * contraste le mieux, au sens de la luminance relative WCAG.
 */
const DARK_INK = '#0f172a';

function relativeLuminance(hex) {
  const parts = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function contrast(a, b) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export function inkOn(background) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(background || '') ? background : '#3B82F6';
  const L = relativeLuminance(hex);
  return contrast(L, relativeLuminance(DARK_INK)) >= contrast(L, 1) ? DARK_INK : '#ffffff';
}

/**
 * Ce qu'on ecrit dans la pastille : les initiales choisies par le joueur,
 * sinon la premiere lettre de son pseudo.
 */
export function initialsOf(user) {
  const chosen = (user?.initials || '').trim();
  if (chosen) return chosen.toUpperCase().slice(0, 3);
  return (user?.username || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Trois lettres dans un rond de 28 px doivent retrecir pour tenir. */
function fontSizeFor(text, size) {
  const ratio = text.length >= 3 ? 0.30 : text.length === 2 ? 0.36 : 0.42;
  return Math.max(9, Math.round(size * ratio));
}

/**
 * Liseré autour de la pastille.
 *
 * Reglage du joueur : "none" pour aucun, une couleur, ou rien du tout — auquel
 * cas on reprend l'accent du theme, qui est le comportement d'origine. La
 * propriete `ring` ne sert plus que de valeur par defaut la ou l'on prefere une
 * pastille nue, comme dans le salon : le choix du joueur, lui, s'applique
 * partout.
 */
export function ringShadow(user, fallback = true) {
  const choice = (user?.avatarRing || '').trim().toLowerCase();
  if (choice === 'none') return undefined;
  if (/^#[0-9a-f]{6}$/.test(choice)) return `0 0 0 2px ${choice}`;
  return fallback ? '0 0 0 2px rgb(var(--a-500))' : undefined;
}

/**
 * Pastille de profil.
 *
 * On tente toujours l'image : le serveur repond 404 quand le joueur n'en a
 * pas, et `onError` bascule alors sur l'initiale coloree. Cela evite d'avoir
 * a transporter un indicateur « a une photo » dans toutes les reponses de
 * l'API — classement, messages, pronostics.
 */
export default function Avatar({ user, size = 32, ring = true, className = '' }) {
  const [version, setVersion] = useState(readVersion);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const onUpdate = () => { setVersion(readVersion()); setBroken(false); };
    window.addEventListener('t14-avatar-maj', onUpdate);
    return () => window.removeEventListener('t14-avatar-maj', onUpdate);
  }, []);

  useEffect(() => { setBroken(false); }, [user?.id]);

  const background = user?.avatarColor || '#3B82F6';
  const text = initialsOf(user);
  const style = {
    width: size,
    height: size,
    backgroundColor: background,
    color: inkOn(background),
    fontSize: fontSizeFor(text, size),
    letterSpacing: text.length > 1 ? '-0.02em' : undefined,
    boxShadow: ringShadow(user, ring),
  };

  const base = `rounded-full shrink-0 overflow-hidden flex items-center justify-center font-display font-bold ${className}`;

  if (!user) return <span className={base} style={style} />;

  if (broken) {
    return (
      <span className={base} style={style} title={user.username}>
        {text}
      </span>
    );
  }

  return (
    <img
      src={avatarUrl(user.id, version)}
      alt={user.username}
      title={user.username}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className={`${base} object-cover`}
      style={style}
    />
  );
}
