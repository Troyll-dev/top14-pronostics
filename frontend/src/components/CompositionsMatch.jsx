import { useState } from 'react';

/**
 * Les compositions d'une rencontre, sous la carte de match.
 *
 * Replié par défaut, et c'est voulu : sur la page Pronostics il y a sept cartes,
 * et quatre-vingt-douze noms dépliés d'un coup rendraient la page illisible pour
 * la seule personne qui veut vérifier si le buteur est titulaire. Le bouton suit
 * exactement le motif de « Pronos des joueurs » — même flèche, même rotation,
 * même survol ambre — parce que deux dépliants qui se ressemblent s'apprennent
 * une fois pour deux.
 *
 * Quand la composition n'est pas encore publiée — le cas normal jusqu'au jeudi —
 * le composant ne rend rien du tout. Pas de bloc vide, pas de « bientôt
 * disponible » : la carte reste exactement comme avant.
 *
 * Deux détails de mise en forme qui viennent de MatchCard, et qui ne se
 * devinent pas.
 *
 * `relative z-10` sur le bloc. La carte porte un fond décoratif (`stitched
 * laced`), et tous ses blocs le franchissent explicitement. Sans cette classe le
 * contenu passerait dessous.
 *
 * Et `text-white` veut dire « encre du thème » : dans la configuration Tailwind
 * du projet, `white` est branché sur la variable `--ink`. C'est donc la bonne
 * classe pour un nom de joueur, et c'est celle que la carte utilise déjà pour
 * les scores. En revanche le brassard de capitaine a un fond de couleur fixe :
 * il est écrit en hexadécimal dans un style direct, comme les pastilles de
 * multiplicateur, parce qu'une classe de palette y prendrait la teinte du thème
 * et redonnerait du noir sur fond sombre.
 */

const CAPITAINE = {
  display: 'inline-block',
  background: '#f59e0b',
  color: '#0b1020',
  fontWeight: 700,
  fontSize: '8.5px',
  padding: '1px 4px',
  borderRadius: '3px',
  letterSpacing: '0.05em',
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
};

const quand = (iso) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    }).format(new Date(iso));
  } catch {
    return null;
  }
};

function Ligne({ joueur }) {
  return (
    <li className="flex items-baseline gap-2 py-px">
      <span className="w-5 shrink-0 text-right text-[10.5px] font-bold tabular-nums text-slate-600">
        {joueur.numero ?? '–'}
      </span>
      <span className="min-w-0 truncate text-[12.5px] text-white">{joueur.nom}</span>
      {joueur.capitaine && <span style={CAPITAINE}>CAP.</span>}
    </li>
  );
}

function Camp({ nom, equipe }) {
  if (!equipe) return null;
  const titulaires = equipe.titulaires || [];
  const remplacants = equipe.remplacants || [];

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 truncate font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        {nom}
      </p>

      <ul className="mb-2">
        {titulaires.map((j) => <Ligne key={`t${j.numero}-${j.id}`} joueur={j} />)}
      </ul>

      {remplacants.length > 0 && (
        <>
          <p className="mb-0.5 font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
            Remplaçants
          </p>
          <ul>
            {remplacants.map((j) => <Ligne key={`r${j.numero}-${j.id}`} joueur={j} />)}
          </ul>
        </>
      )}
    </div>
  );
}

export default function CompositionsMatch({ match }) {
  const [ouvert, setOuvert] = useState(false);

  const c = match?.composition;
  // Une composition à moins de quinze titulaires de chaque côté n'est pas une
  // composition : le service ne l'écrit pas, mais une vieille ligne en base ne
  // doit pas produire un bloc à moitié vide.
  const prete =
    c && (c.home?.titulaires?.length || 0) >= 15 && (c.away?.titulaires?.length || 0) >= 15;
  if (!prete) return null;

  const le = quand(match.compositionAt);

  return (
    <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-amber-400"
      >
        <span className={`text-[9px] text-amber-500 transition-transform ${ouvert ? 'rotate-90' : ''}`}>▶</span>
        Compositions
        {le && <span className="text-slate-600">· annoncées {le}</span>}
      </button>

      {ouvert && (
        <div className="mt-2.5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Camp nom={match.homeTeam?.name || 'Domicile'} equipe={c.home} />
            <Camp nom={match.awayTeam?.name || 'Extérieur'} equipe={c.away} />
          </div>

          <p className="mt-2.5 text-[10.5px] leading-relaxed text-slate-600">
            {c.arbitre && <>Arbitre : {c.arbitre}. </>}
            Le numéro de maillot fait foi ; le poste annoncé par la LNR est parfois approximatif.
            {c.url && (
              <>
                {' '}
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline transition-colors hover:text-amber-400"
                >
                  Feuille de match
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
