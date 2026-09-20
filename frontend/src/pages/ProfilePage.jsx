import { useState, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { bumpAvatarVersion, inkOn } from '../components/Avatar';

const AVATAR_SIZE = 128;
const MAX_UPLOAD = 8 * 1024 * 1024;   // garde-fou avant lecture, 8 Mo

// Quelques teintes lisibles sur les deux thèmes. Le sélecteur libre reste
// disponible à côté pour ceux qui veulent autre chose.
const PRESETS = [
  '#EC4899', '#F59E0B', '#7C3AED', '#3B82F6', '#10B981',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#64748B',
];

/**
 * Recadre au centre et redimensionne en 128x128 dans le navigateur.
 *
 * Tout se passe ici, avant l'envoi : le serveur ne reçoit que quelques
 * kilo-octets et n'a aucune bibliothèque de traitement d'image à installer.
 */
async function toSquareDataUrl(file, size = AVATAR_SIZE) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  // webp d'abord ; un navigateur qui ne sait pas l'encoder renvoie
  // silencieusement du png, d'où la vérification du préfixe.
  for (const type of ['image/webp', 'image/jpeg']) {
    const url = canvas.toDataURL(type, 0.85);
    if (url.startsWith(`data:${type}`)) return url;
  }
  return canvas.toDataURL('image/png');
}

export default function ProfilePage() {
  const auth = useAuth();
  const { user } = auth;

  const [username, setUsername] = useState(user?.username || '');
  const [color, setColor] = useState(user?.avatarColor || '#3B82F6');
  const [photo, setPhoto] = useState(undefined);   // undefined = inchangée, null = retirée
  const [preview, setPreview] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const fileRef = useRef(null);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';           // permet de resélectionner le même fichier
    if (!file) return;

    setError('');
    setDone(false);

    if (!file.type.startsWith('image/')) {
      setError('Choisis une image');
      return;
    }
    if (file.size > MAX_UPLOAD) {
      setError('Image trop lourde (8 Mo maximum)');
      return;
    }

    try {
      const dataUrl = await toSquareDataUrl(file);
      setPhoto(dataUrl);
      setPreview(dataUrl);
    } catch {
      setError('Image illisible');
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPreview(null);
    setDone(false);
  };

  const dirty =
    username.trim() !== (user?.username || '') ||
    color !== (user?.avatarColor || '') ||
    photo !== undefined;

  const save = async () => {
    setSaving(true);
    setError('');
    setDone(false);

    const body = {};
    if (username.trim() !== user?.username) body.username = username.trim();
    if (color !== user?.avatarColor) body.avatarColor = color;
    if (photo !== undefined) body.avatar = photo;

    try {
      await api.patch('/users/me', body);
      // La photo est servie par une URL : sans nouveau jeton, le navigateur
      // continuerait d'afficher l'ancienne pendant cinq minutes.
      if (photo !== undefined) bumpAvatarVersion();

      if (auth.refreshUser) await auth.refreshUser();
      else window.location.reload();

      setPhoto(undefined);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  // Aperçu : la photo qu'on vient de choisir, sinon celle du serveur.
  const shown = { ...user, avatarColor: color, username: username.trim() || user?.username };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">Mon profil</h1>
      <p className="text-xs italic text-slate-500 mb-5">
        Ta pastille et ton pseudo, tels que les autres les voient
      </p>

      <div className="card mb-4">
        <h2 className="rule-label mb-4">Aperçu</h2>
        <div className="flex items-center gap-4">
          {preview ? (
            <img
              src={preview}
              alt="Aperçu"
              width={56}
              height={56}
              className="rounded-full shrink-0 object-cover"
              style={{ width: 56, height: 56, boxShadow: '0 0 0 2px rgb(var(--a-500))' }}
            />
          ) : photo === null ? (
            <span
              className="rounded-full shrink-0 flex items-center justify-center font-display font-bold"
              style={{
                width: 56, height: 56, backgroundColor: color, color: inkOn(color),
                fontSize: 24, boxShadow: '0 0 0 2px rgb(var(--a-500))',
              }}
            >
              {(username.trim() || user?.username || '?')[0].toUpperCase()}
            </span>
          ) : (
            <Avatar user={shown} size={56} />
          )}

          <div className="min-w-0">
            <p className="font-display font-bold text-[16px] truncate">
              {username.trim() || user?.username}
            </p>
            <p className="text-[12px] text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Pseudo */}
      <div className="card mb-4">
        <h2 className="rule-label mb-3">Pseudo</h2>
        <input
          value={username}
          onChange={(e) => { setUsername(e.target.value.slice(0, 20)); setDone(false); }}
          maxLength={20}
          className="w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2
                     text-[14px] text-white placeholder:text-slate-600
                     focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors"
          placeholder="Ton pseudo"
        />
        <p className="text-[11.5px] text-slate-500 mt-2">
          De 2 à 20 caractères. Il apparaît dans le classement, les pronos et le vestiaire.
          Tes anciens messages et pronostics suivent automatiquement.
        </p>
      </div>

      {/* Couleur */}
      <div className="card mb-4">
        <h2 className="rule-label mb-3">Couleur de la pastille</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setDone(false); }}
              title={c}
              className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-2 ring-amber-500 ring-offset-transparent' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2.5 text-[12.5px] text-slate-400">
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); setDone(false); }}
            className="w-9 h-9 rounded-md bg-transparent border border-slate-800 cursor-pointer"
          />
          Une autre couleur — <span className="tabular-nums">{color}</span>
        </label>
        <p className="text-[11.5px] text-slate-500 mt-2">
          Elle sert de fond à ton initiale, et de repère pour retrouver tes pronos d’un coup d’œil.
        </p>
      </div>

      {/* Photo */}
      <div className="card mb-4">
        <h2 className="rule-label mb-3">Photo ou logo</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => fileRef.current?.click()} className="btn-primary text-[13px] py-2">
            Choisir une image
          </button>
          {(preview || (photo === undefined && user)) && (
            <button
              onClick={removePhoto}
              className="text-[13px] text-slate-500 hover:text-red-400 transition-colors"
            >
              Retirer la photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickFile}
            className="hidden"
          />
        </div>
        <p className="text-[11.5px] text-slate-500 mt-3">
          L’image est recadrée au centre et réduite en 128 × 128 dans ton navigateur avant
          l’envoi : elle ne pèse plus que quelques kilo-octets. Prends de préférence une image
          déjà carrée, sinon les bords seront rognés.
        </p>
      </div>

      {/* Enregistrer */}
      <div className="card border-l-4 border-l-amber-500">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {error ? (
              <p className="text-[13px] text-red-400">{error}</p>
            ) : done ? (
              <p className="text-[13px] text-green-400">✅ Profil enregistré</p>
            ) : dirty ? (
              <p className="text-[13px] text-slate-400">Des changements ne sont pas enregistrés.</p>
            ) : (
              <p className="text-[13px] text-slate-500">Rien à enregistrer pour le moment.</p>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="btn-primary text-[13.5px] shrink-0"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
