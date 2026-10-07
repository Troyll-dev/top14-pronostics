import { useState, useRef, useLayoutEffect, useCallback } from 'react';

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
 * ---------------------------------------------------------------------------
 * Deux colonnes, toujours
 * ---------------------------------------------------------------------------
 *
 * Les deux camps étaient côte à côte à partir de 640 pixels et empilés en
 * dessous, c'est-à-dire empilés sur tous les téléphones. Or une composition se
 * lit en comparant : le numéro 9 d'en face est en regard du numéro 9. Empilés,
 * il faut faire défiler quarante-six lignes pour passer de l'un à l'autre, et
 * la comparaison ne se fait plus.
 *
 * Donc deux colonnes à toutes les largeurs. Ce qu'on y perd, c'est de la place
 * pour les noms, et c'est le sujet du paragraphe suivant.
 *
 * ---------------------------------------------------------------------------
 * Une ligne par joueur, et comment on s'y tient
 * ---------------------------------------------------------------------------
 *
 * Une ligne par joueur, sans exception. C'est l'inverse du choix fait sur les
 * noms d'équipes de la carte de match, où un nom trop long passe à la ligne —
 * et la différence est voulue. Une carte porte deux noms, qu'on lit ; une
 * composition en aligne quarante-six sous leur numéro, qu'on parcourt du
 * regard. Un seul nom replié décale tout ce qui suit et l'on perd la colonne.
 *
 * Quand un nom ne tient pas, on l'abrège en trois temps :
 *
 *   1. le nom complet, si la place le permet ;
 *   2. sinon le prénom réduit à son initiale, nom de famille entier ;
 *   3. sinon le nom de famille coupé par le navigateur, avec des points de
 *      suspension.
 *
 * Le passage de 1 à 2 se décide en mesurant, pas en comptant des caractères.
 * Compter donne toujours faux — un « i » et un « M » n'ont pas la même largeur,
 * et le verdict changerait d'un téléphone à l'autre. On laisse donc le
 * navigateur rendre les noms complets, on lui demande lesquels débordent, et
 * s'il y en a, on abrège **toute la colonne**. Abréger seulement les coupables
 * donnerait une colonne mélangée, « J. Gros » au-dessus de « Baptiste Dupont »,
 * qui se lit moins bien que l'abréviation franche.
 *
 * La mesure ne peut que faire passer une colonne en abrégé, jamais l'inverse :
 * sans cette asymétrie, abréger supprimerait le débordement, ce qui rétablirait
 * les noms complets, ce qui recréerait le débordement — une bascule sans fin.
 * Le retour aux noms complets se fait uniquement quand la largeur change
 * vraiment, c'est-à-dire sur rotation ou redimensionnement.
 *
 * ---------------------------------------------------------------------------
 * Deux détails de mise en forme qui viennent de MatchCard
 * ---------------------------------------------------------------------------
 *
 * `relative z-10` sur le bloc. La carte porte un fond décoratif (`stitched`),
 * et tous ses blocs le franchissent explicitement. Sans cette classe le contenu
 * passerait dessous.
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

/** La première lettre d'un mot, suivie d'un point. « Jean-Baptiste » → « J. ». */
function initiale(mot) {
  const c = [...String(mot)][0] || '';
  return c ? `${c.toLocaleUpperCase('fr')}.` : '';
}

/**
 * Le nom abrégé : initiale du prénom, nom de famille entier.
 *
 * La LNR livre « Jean-Baptiste Gros » — prénom d'abord, nom ensuite, en casse
 * ordinaire. Vérifié sur une feuille de match réelle, et c'est ce qui autorise
 * une règle aussi simple : le premier mot est le prénom, tout le reste est le
 * nom. Les particules suivent sans rien casser, « Jean van der Merwe » donnant
 * « J. van der Merwe ».
 *
 * Si la LNR changeait de format un jour — un nom de famille en capitales, ou
 * placé en tête — cette fonction serait le seul endroit à reprendre, et le
 * défaut se verrait tout de suite : on lirait « J. Baptiste » au lieu de
 * « J. Gros ».
 *
 * Un nom d'un seul mot est rendu tel quel : il n'y a pas de prénom à réduire,
 * et c'est alors au navigateur de couper (étape 3).
 */
function abrege(nom) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return String(nom || '');
  return `${initiale(mots[0])} ${mots.slice(1).join(' ')}`;
}

function Ligne({ joueur, court }) {
  const nom = court ? abrege(joueur.nom) : joueur.nom;
  return (
    <li className="flex items-baseline gap-1.5 py-px">
      <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-600">
        {joueur.numero ?? '–'}
      </span>
      {/* `title` porte toujours le nom complet : sur ordinateur, un nom abrégé
          ou coupé se relit au survol sans avoir à élargir la fenêtre. */}
      <span
        data-nom
        title={joueur.nom}
        className="min-w-0 flex-1 truncate text-[12px] text-white"
      >
        {nom}
      </span>
      {joueur.capitaine && <span style={CAPITAINE}>CAP.</span>}
    </li>
  );
}

function Camp({ nom, equipe, court, conteneur }) {
  if (!equipe) return null;
  const titulaires = equipe.titulaires || [];
  const remplacants = equipe.remplacants || [];

  return (
    <div ref={conteneur} className="min-w-0">
      <p className="mb-1 truncate font-display text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {nom}
      </p>

      <ul className="mb-2">
        {titulaires.map((j) => <Ligne key={`t${j.numero}-${j.id}`} joueur={j} court={court} />)}
      </ul>

      {remplacants.length > 0 && (
        <>
          <p className="mb-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-slate-600">
            Remplaçants
          </p>
          <ul>
            {remplacants.map((j) => <Ligne key={`r${j.numero}-${j.id}`} joueur={j} court={court} />)}
          </ul>
        </>
      )}
    </div>
  );
}

export default function CompositionsMatch({ match }) {
  const [ouvert, setOuvert] = useState(false);

  // Un état par colonne : les deux camps n'ont pas forcément des noms de la
  // même longueur, et il n'y a aucune raison d'abréger celui qui tient.
  const [court, setCourt] = useState({ home: false, away: false });
  const refHome = useRef(null);
  const refAway = useRef(null);
  const largeur = useRef(0);

  /**
   * Un nom déborde-t-il dans cette colonne ?
   *
   * `scrollWidth` est la largeur qu'il faudrait au texte, `clientWidth` celle
   * dont il dispose. L'écart d'un pixel toléré évite de réagir aux arrondis
   * sub-pixel d'un zoom de navigateur.
   */
  const deborde = (el) =>
    !!el && Array.from(el.querySelectorAll('[data-nom]'))
      .some((s) => s.scrollWidth > s.clientWidth + 1);

  const mesurer = useCallback(() => {
    setCourt((prev) => {
      const h = prev.home || deborde(refHome.current);
      const a = prev.away || deborde(refAway.current);
      return h === prev.home && a === prev.away ? prev : { home: h, away: a };
    });
  }, []);

  // Mesure après chaque rendu du bloc ouvert. Elle ne peut qu'ajouter des
  // abréviations, donc elle converge en un ou deux passages.
  useLayoutEffect(() => {
    if (ouvert) mesurer();
  });

  /**
   * Au redimensionnement, on redonne leur chance aux noms complets.
   *
   * C'est le seul endroit qui remet `court` à faux, et il ne le fait que si la
   * largeur a réellement changé : un ResizeObserver se déclenche aussi quand le
   * contenu change de hauteur, ce qui arrive précisément quand on abrège.
   */
  useLayoutEffect(() => {
    if (!ouvert) return;
    const el = refHome.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    largeur.current = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const l = refHome.current?.clientWidth ?? 0;
      if (l && Math.abs(l - largeur.current) > 1) {
        largeur.current = l;
        setCourt({ home: false, away: false });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ouvert]);

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
          {/* Deux colonnes à toutes les largeurs. `grid` plutôt que `flex` :
              les deux colonnes font exactement la même largeur quoi qu'il
              arrive, donc les numéros d'en face restent en regard. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Camp
              nom={match.homeTeam?.name || 'Domicile'}
              equipe={c.home}
              court={court.home}
              conteneur={refHome}
            />
            <Camp
              nom={match.awayTeam?.name || 'Extérieur'}
              equipe={c.away}
              court={court.away}
              conteneur={refAway}
            />
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
