import { useState, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { bumpAvatarVersion, inkOn, initialsOf, ringShadow } from '../components/Avatar';
import ChampMotDePasse from '../components/ChampMotDePasse';

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

/**
 * Un interrupteur, pour les réglages qui s'appliquent tout de suite.
 *
 * Volontairement différent des champs du haut de page : ceux-là attendent le
 * bouton « Enregistrer », celui-ci agit au clic. La distinction se justifie par
 * l'enjeu — couper un courriel est une décision isolée, qu'on ne veut pas voir
 * dépendre du fait qu'on pense ensuite à enregistrer une couleur de pastille.
 */
function Interrupteur({ actif, onChange, occupe, titre, detail }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={actif}
        disabled={occupe}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 shrink-0 accent-amber-500 cursor-pointer disabled:cursor-wait"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-display font-semibold">{titre}</span>
        <span className="block text-[11.5px] text-slate-500 leading-relaxed">{detail}</span>
      </span>
    </label>
  );
}

export default function ProfilePage() {
  const auth = useAuth();
  const { user } = auth;

  const [username, setUsername] = useState(user?.username || '');
  const [color, setColor] = useState(user?.avatarColor || '#3B82F6');
  const [initials, setInitials] = useState(user?.initials || '');
  const [ring, setRing] = useState(user?.avatarRing || '');   // '' = liseré du thème
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
    initials.trim().toUpperCase() !== (user?.initials || '') ||
    ring !== (user?.avatarRing || '') ||
    photo !== undefined;

  const save = async () => {
    setSaving(true);
    setError('');
    setDone(false);

    const body = {};
    if (username.trim() !== user?.username) body.username = username.trim();
    if (color !== user?.avatarColor) body.avatarColor = color;
    if (initials.trim().toUpperCase() !== (user?.initials || '')) {
      body.initials = initials.trim() || null;
    }
    if (ring !== (user?.avatarRing || '')) body.avatarRing = ring || null;
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
  const shown = {
    ...user,
    avatarColor: color,
    initials: initials.trim(),
    avatarRing: ring,
    username: username.trim() || user?.username,
  };

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
              style={{ width: 56, height: 56, boxShadow: ringShadow({ avatarRing: ring }) }}
            />
          ) : photo === null ? (
            <span
              className="rounded-full shrink-0 flex items-center justify-center font-display font-bold"
              style={{
                width: 56, height: 56, backgroundColor: color, color: inkOn(color),
                fontSize: initials.trim().length >= 3 ? 17 : initials.trim().length === 2 ? 20 : 24,
                boxShadow: ringShadow({ avatarRing: ring }),
              }}
            >
              {initialsOf({ initials, username: username.trim() || user?.username })}
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
          De 2 à 20 caractères. Il apparaît dans le classement, les pronos et le Comptoir.
          Tes anciens messages et pronostics suivent automatiquement.
        </p>

        <h2 className="rule-label mt-5 mb-3">Initiales de la pastille</h2>
        <div className="flex items-center gap-3">
          <input
            value={initials}
            onChange={(e) => { setInitials(e.target.value.slice(0, 3)); setDone(false); }}
            maxLength={3}
            placeholder={(username.trim() || user?.username || '?')[0]?.toUpperCase()}
            className="w-24 text-center uppercase bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2
                       font-display font-bold text-[16px] tracking-wide text-white placeholder:text-slate-600
                       focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors"
          />
          {initials.trim() && (
            <button
              onClick={() => { setInitials(''); setDone(false); }}
              className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors"
            >
              Revenir à l’initiale du pseudo
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-slate-500 mt-2">
          Une à trois lettres ou chiffres — « NBO » plutôt que « N ». Laisse vide pour reprendre
          la première lettre de ton pseudo. Elles ne servent que si tu n’as pas de photo.
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

      {/* Liseré */}
      <div className="card mb-4">
        <h2 className="rule-label mb-3">Liseré autour de la pastille</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => { setRing(''); setDone(false); }}
            className={`font-display text-[12.5px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              ring === '' ? 'chip-accent border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            Celui du thème
          </button>
          <button
            onClick={() => { setRing('none'); setDone(false); }}
            className={`font-display text-[12.5px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              ring === 'none' ? 'chip-accent border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            Aucun
          </button>
          <label className={`flex items-center gap-2 font-display text-[12.5px] font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
            ring.startsWith('#') ? 'chip-accent border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
          }`}>
            <input
              type="color"
              value={ring.startsWith('#') ? ring : '#ffffff'}
              onChange={(e) => { setRing(e.target.value.toLowerCase()); setDone(false); }}
              className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer p-0"
            />
            Ma couleur
          </label>
        </div>
        <p className="text-[11.5px] text-slate-500">
          Par défaut c’est la brique du thème. Le liseré entoure aussi ta photo, si tu en as une.
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

      <CourrielsSection />

      <SecuritySection />
    </div>
  );
}

const field =
  'w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2 ' +
  'text-[14px] text-white placeholder:text-slate-600 ' +
  'focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors';

/**
 * Courriels et participation.
 *
 * Les memes reglages que les liens au bas de chaque courriel, du cote du site
 * cette fois. Les deux voies existent parce qu'elles servent deux moments : le
 * lien sert a partir, sans se connecter, quand on ne revient plus ; cette
 * page-ci sert a revenir, ou a doser.
 *
 * Tout s'applique au clic, sans bouton « Enregistrer ». Ces reglages n'ont rien
 * a voir avec la couleur d'une pastille : couper un courriel est une decision
 * isolee, et la faire dependre du fait qu'on pense ensuite a enregistrer serait
 * une facon de ne pas la respecter.
 *
 * Le repli sur `true` couvre le temps d'un deploiement, ou le serveur ne
 * renvoie pas encore ces champs : on montre alors l'etat par defaut, qui est
 * celui de tout le monde avant d'y avoir touche.
 */
function CourrielsSection() {
  const auth = useAuth();
  const { user } = auth;

  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [confirmePause, setConfirmePause] = useState(false);

  const rappels = user?.mailRappels !== false;
  const bilan = user?.mailBilan !== false;
  const enPause = user?.enPause === true;

  const enregistrer = async (corps) => {
    setOccupe(true);
    setErreur('');
    try {
      await api.patch('/users/me', corps);
      if (auth.refreshUser) await auth.refreshUser();
      else window.location.reload();
    } catch (err) {
      setErreur(err.response?.data?.error || 'Changement impossible');
    } finally {
      setOccupe(false);
      setConfirmePause(false);
    }
  };

  return (
    <>
      <h2 className="rule-label mt-8 mb-3">Courriels et participation</h2>

      <div className="card">
        {enPause ? (
          /*
            L'etat de pause prend toute la carte, et les cases disparaissent.
            Proposer de regler des courriels a quelqu'un qui n'en recoit aucun
            n'a pas de sens : la seule chose a decider ici est s'il revient.
          */
          <>
            <p className="text-[13.5px] font-display font-semibold mb-1">Tu es en pause</p>
            <p className="text-[12.5px] text-slate-500 leading-relaxed mb-4">
              Tu ne reçois plus aucun courriel et tu n’apparais plus au classement.
              Rien n’a été effacé : tes pronostics et tes points t’attendent.
            </p>
            <button
              onClick={() => enregistrer({ enPause: false, mailRappels: true, mailBilan: true })}
              disabled={occupe}
              className="btn-primary text-[13px] py-2"
            >
              {occupe ? '…' : 'Reprendre le jeu'}
            </button>
            <p className="text-[11.5px] text-slate-500 mt-2.5">
              Les deux courriels seront réactivés en même temps ; tu pourras les couper
              séparément juste après.
            </p>
          </>
        ) : (
          <>
            <Interrupteur
              actif={rappels}
              occupe={occupe}
              onChange={(v) => enregistrer({ mailRappels: v })}
              titre="Le rappel du vendredi"
              detail="Envoyé à 17 h, seulement s’il te manque des pronostics pour la journée qui vient."
            />
            <Interrupteur
              actif={bilan}
              occupe={occupe}
              onChange={(v) => enregistrer({ mailBilan: v })}
              titre="Le bilan du lundi"
              detail="Le vainqueur du week-end, le classement et le fait marquant de la journée."
            />

            <div className="mt-4 pt-3.5 border-t border-slate-800">
              {confirmePause ? (
                <>
                  <p className="text-[12.5px] text-slate-400 mb-3 leading-relaxed">
                    Tu ne recevras plus aucun courriel et tu sortiras du classement.
                    Tes pronostics et tes points restent en place, et tu peux revenir
                    quand tu veux depuis cette page.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => enregistrer({ enPause: true })}
                      disabled={occupe}
                      className="font-display text-[13px] font-semibold px-3.5 py-2 rounded border
                                 border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      {occupe ? '…' : 'Oui, me mettre en pause'}
                    </button>
                    <button
                      onClick={() => setConfirmePause(false)}
                      className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setConfirmePause(true)}
                  className="text-[13px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  Ne plus jouer cette saison
                </button>
              )}
            </div>
          </>
        )}

        {erreur && <p className="text-[12.5px] text-red-400 mt-3">{erreur}</p>}

        <p className="text-[11px] italic text-slate-600 mt-4">
          Ces mêmes réglages se trouvent aussi au bas de chaque courriel, accessibles sans
          se connecter. Aucun n’efface quoi que ce soit.
        </p>
      </div>
    </>
  );
}

/**
 * Mot de passe.
 *
 * A part du reste de la page : le changement passe par sa propre route, exige
 * le mot de passe actuel, et n'a rien a faire dans le meme bouton
 * « Enregistrer » que la couleur de la pastille.
 *
 * L'adresse e-mail n'est pas modifiable : elle sert d'identifiant de connexion
 * et de point de chute pour la reinitialisation. Entre amis, une adresse se
 * change directement en base le jour ou c'est necessaire.
 */
function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwdState, setPwdState] = useState({ busy: false, error: '', done: false });

  const submitPassword = async () => {
    if (next !== confirm) {
      setPwdState({ busy: false, error: 'Les deux nouveaux mots de passe diffèrent', done: false });
      return;
    }
    setPwdState({ busy: true, error: '', done: false });
    try {
      await api.patch('/users/me/password', { currentPassword: current, newPassword: next });
      setCurrent(''); setNext(''); setConfirm('');
      setPwdState({ busy: false, error: '', done: true });
    } catch (err) {
      setPwdState({ busy: false, error: err.response?.data?.error || 'Changement impossible', done: false });
    }
  };

  return (
    <>
      <h2 className="rule-label mt-8 mb-3">Mot de passe</h2>

      <div className="card">
        <p className="text-[12.5px] text-slate-500 mb-3">
          Huit caractères minimum. Si tu l’as oublié, la page de connexion propose
          « Mot de passe oublié ? » : un lien te sera envoyé par e-mail.
        </p>
        <div className="space-y-2">
          <ChampMotDePasse
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Mot de passe actuel"
            className={field}
          />
          <ChampMotDePasse
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Nouveau mot de passe"
            className={field}
          />
          {/* Ici on garde le second champ, et ce n'est pas contradictoire avec
              l'oeil de l'inscription : changer son mot de passe se fait sur un
              compte deja ouvert, ou la friction ne coute pas une inscription
              perdue — et ou une faute de frappe se paie d'une deconnexion de
              tous ses appareils. */}
          <ChampMotDePasse
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Répète le nouveau"
            className={field}
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-[12.5px]">
            {pwdState.error && <span className="text-red-400">{pwdState.error}</span>}
            {pwdState.done && <span className="text-green-400">✅ Mot de passe modifié</span>}
          </span>
          <button
            onClick={submitPassword}
            disabled={pwdState.busy || !current || next.length < 8 || !confirm}
            className="btn-primary text-[13px] py-2 shrink-0"
          >
            {pwdState.busy ? '…' : 'Changer le mot de passe'}
          </button>
        </div>
        <p className="text-[11px] italic text-slate-600 mt-3">
          Tes autres appareils déjà connectés le restent : le jeton de session garde sa validité
          jusqu’à son expiration.
        </p>
      </div>
    </>
  );
}
