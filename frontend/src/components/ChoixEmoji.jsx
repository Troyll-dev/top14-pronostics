import { useState, useEffect, useRef } from 'react';

/**
 * Le choix d'un emoji, sans bibliothèque.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI PAS UN PAQUET TOUT FAIT
 * ---------------------------------------------------------------------------
 *
 * Les sélecteurs d'emojis du marché embarquent les quelque trois mille cinq
 * cents caractères du standard, leurs noms, leurs traductions, une recherche et
 * souvent leurs propres images — plusieurs centaines de kilo-octets téléchargés
 * par chaque joueur, à chaque mise à jour du site, pour un salon où l'on tape
 * surtout un ballon et une chope.
 *
 * Ici, une soixantaine d'emojis choisis à la main, rangés par thème, écrits en
 * clair dans ce fichier. Pas de dépendance, pas de téléchargement, et la liste
 * se modifie en une ligne le jour où il en manque un.
 *
 * Ce qu'on perd : la recherche, et les trois mille quatre cents autres. Le
 * clavier du téléphone les propose tous de toute façon, et c'est bien le seul
 * endroit où l'on en a réellement besoin — sur ordinateur, personne ne va
 * chercher le drapeau des Fidji au milieu d'un pronostic.
 *
 * ---------------------------------------------------------------------------
 * CE QUI EST GÉRÉ ET QU'ON NE DEVINE PAS
 * ---------------------------------------------------------------------------
 *
 * L'insertion se fait **à l'endroit du curseur**, pas à la fin : on ajoute
 * souvent un emoji au milieu d'une phrase qu'on vient de relire, et un panneau
 * qui recolle tout en bout de texte oblige à retaper.
 *
 * Le panneau se ferme au clic en dehors et à la touche Échap, comme tout
 * panneau — sans ces deux-là, il faut viser le bouton pour s'en débarrasser,
 * ce qui est exactement le genre de petite dette qui agace à chaque usage.
 *
 * Et les emojis sont dessinés par le système, donc différents sur un iPhone,
 * sur Android et sur Windows. C'est assumé ici, contrairement aux icônes du
 * site : un emoji dans un message est le mot de celui qui l'écrit, pas un
 * élément d'interface — il a le droit d'avoir l'accent de son appareil.
 */

const FAMILLES = [
  {
    nom: 'Rugby',
    liste: ['🏉', '🥅', '🏆', '🥇', '🥈', '🥉', '⏱️', '📣', '🎽', '🤕', '🧤', '🩹'],
  },
  {
    nom: 'Réactions',
    liste: ['😂', '😅', '😮', '😱', '😭', '🤣', '😏', '😬', '🙄', '🤔', '😤', '🤯'],
  },
  {
    nom: 'Pouces',
    liste: ['👏', '👍', '👎', '🙌', '💪', '🤝', '🙏', '🫡', '🤞', '✌️', '👀', '🫵'],
  },
  {
    nom: 'Comptoir',
    liste: ['🍺', '🍻', '🥂', '🍷', '🥃', '☕', '🍕', '🧀', '🥖', '🔥', '❄️', '🌧️'],
  },
  {
    nom: 'Verdicts',
    liste: ['✅', '❌', '⭐', '💯', '🎯', '🤡', '💀', '🧊', '🚀', '🐙', '🐓', '🧨'],
  },
];

export default function ChoixEmoji({ onChoix, disabled = false }) {
  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef(null);

  useEffect(() => {
    if (!ouvert) return;

    const dehors = (e) => {
      if (cadre.current && !cadre.current.contains(e.target)) setOuvert(false);
    };
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };

    // En phase de capture : un clic dans la conversation ferme le panneau avant
    // que ce clic ne fasse autre chose, ce qui est le comportement attendu.
    document.addEventListener('mousedown', dehors, true);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', dehors, true);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  return (
    <div ref={cadre} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        disabled={disabled}
        title="Emojis"
        aria-label="Emojis"
        className={`h-9 w-9 rounded-md border-[1.5px] border-slate-800 bg-slate-950 text-[17px] leading-none
                    transition-colors disabled:opacity-40 ${
                      ouvert ? 'border-amber-500' : 'hover:border-amber-500'
                    }`}
      >
        🙂
      </button>

      {ouvert && (
        /* Au-dessus du bouton et aligné à droite : sous lui, le panneau
           tomberait derrière le clavier du téléphone, qui occupe la moitié
           basse de l'écran dès que la zone de saisie a le curseur. */
        <div
          className="absolute bottom-full right-0 mb-2 z-30 w-[268px] max-h-[260px] overflow-y-auto
                     rounded-lg border border-slate-800 bg-slate-900 p-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.65)]"
        >
          {FAMILLES.map((f) => (
            <div key={f.nom} className="mb-1.5 last:mb-0">
              <p className="font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">
                {f.nom}
              </p>
              <div className="grid grid-cols-6 gap-0.5">
                {f.liste.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onChoix(e); setOuvert(false); }}
                    className="h-9 text-[19px] leading-none rounded hover:bg-slate-800 transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
