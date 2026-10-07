import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TeamCrest from './TeamCrest';
import { matchState, STATE, STATE_CHIP } from '../utils/matchState';
import CompositionsMatch from './CompositionsMatch';
import FormeClubs from './FormeClubs';

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      max="150"
      value={value}
      // On laisse passer la chaine vide : convertir tout de suite afficherait
      // un 0 des que l'on efface le champ.
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled}
      className="w-[52px] h-11 text-center font-display text-xl font-bold tabular-nums
                 bg-slate-950 border-[1.5px] border-slate-800 rounded-md text-white
                 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25
                 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
    />
  );
}

/**
 * Les étiquettes de points.
 *
 * Elles étaient indexées par le nombre de points, de 0 à 3. Avec les
 * multiplicateurs ça ne tient plus : un score exact joué en joker vaut 6, et
 * l'index retombait alors sur la valeur par défaut, c'est-à-dire « ❌ Raté 0 »
 * — le pire pronostic de la journée affiché sur le meilleur.
 *
 * L'étiquette se lit donc sur `basePoints`, qui reste de 0 à 3 et dit la
 * qualité du pronostic, tandis que le total multiplié est affiché à côté. Les
 * deux nombres répondent à deux questions différentes : « ai-je bien deviné »
 * et « combien ça rapporte ».
 *
 * Le repli sur `points` couvre les pronostics d'avant les multiplicateurs, dont
 * `basePoints` est nul : à cette époque les deux valeurs étaient égales.
 */
const POINTS = {
  3: { cls: 'bg-green-500 text-slate-950', label: '🎯 Score exact' },
  2: { cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/45', label: '✅ À 5 points près' },
  1: { cls: 'bg-slate-700/40 text-slate-400 border border-slate-700', label: '✅ Bon vainqueur' },
  0: { cls: 'bg-slate-800/60 text-slate-500 border border-slate-800', label: '❌ Raté' },
};

const base = (p) => (p?.basePoints ?? p?.points);

/**
 * Les deux pastilles de multiplicateur, en style direct et non en classes.
 *
 * Elles étaient écrites `bg-violet-600 text-white`, et le texte ressortait
 * quand même en noir : quelque chose l'emportait sur la classe de couleur —
 * une règle de la feuille de style du projet, ou une teinte absente de la
 * configuration Tailwind, qui n'aurait alors rien produit du tout.
 *
 * Plutôt que de chercher laquelle, on sort du problème. Un style posé
 * directement sur l'élément l'emporte sur toute règle de feuille de style, et
 * les couleurs sont écrites en clair : elles ne dépendent plus d'aucune
 * palette, d'aucun thème, d'aucun ordre de chargement. Ce sont deux pastilles,
 * ça ne justifie pas de déboguer une cascade.
 *
 * Contrastes mesurés, identiques sur les deux thèmes puisque le fond est plein :
 * 5,7 pour le blanc sur violet, 9,4 pour le noir sur ambre. Le seuil est 4,5.
 */
const PASTILLE_COMMUN = {
  display: 'inline-block',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '9.5px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
};

const PASTILLE = {
  affiche: { ...PASTILLE_COMMUN, background: '#f59e0b', color: '#0b1020' },
  joker: { ...PASTILLE_COMMUN, background: '#7c3aed', color: '#ffffff' },
};


function PointsBadge({ prediction }) {
  const total = prediction?.points;
  if (total === null || total === undefined) return null;

  const b = base(prediction);
  const c = POINTS[b] ?? POINTS[0];
  const mult = b > 0 ? Math.round(total / b) : 1;

  return (
    <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded whitespace-nowrap ${c.cls}`}>
      {c.label} +{total}
      {mult > 1 && <span className="opacity-75"> ({b} ×{mult})</span>}
    </span>
  );
}

function PointsChip({ prediction }) {
  const total = prediction?.points;
  if (total === null || total === undefined) return null;

  const b = base(prediction);
  const cls = {
    3: 'bg-green-500 text-slate-950',
    2: 'bg-amber-500/20 text-amber-400',
    1: 'bg-slate-700/45 text-slate-400',
    0: 'bg-slate-800/60 text-slate-500',
  }[b] || 'bg-slate-800/60 text-slate-500';

  return (
    <span className={`font-display text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      {prediction.joker && '🃏'}+{total}
    </span>
  );
}

/**
 * Les scores saisis ne vivent plus dans cette carte mais dans MatchesPage,
 * qui les sauvegarde dans le navigateur et sait tout valider d'un coup.
 * La carte est donc pilotee par `draft` et remonte chaque frappe.
 */
export default function MatchCard({
  match, draft, onDraftChange, onPredictionSaved, now = Date.now(),
  regles = null, onJoker = null, jokerFige = false, jokerErreur = '',
}) {
  const { user } = useAuth();
  const prediction = match.predictions?.[0];

  /**
   * Les multiplicateurs.
   *
   * `regles` vient du serveur ; tant qu'il n'est pas arrivé, ou si la journée
   * est antérieure à la mise en vigueur, tout ce bloc s'efface et la carte
   * retrouve exactement son apparence d'avant. Une règle qu'on n'a pas encore
   * lue ne doit pas s'afficher à moitié.
   */
  const reglesActives = !!regles?.actif;
  const estAffiche = reglesActives && regles.afficheMatchId === match.id;
  const estJoker = reglesActives && regles.jokerMatchId === match.id;

  /* Le joker se pose depuis la carte du match, avec un bouton radio.

     Il a d'abord vécu ici en case à cocher, puis dans une liste déroulante du
     Récapitulatif, et il revient dans la carte — mais pas sous la même forme,
     et c'est toute la différence. Une case à cocher ne dit rien de
     l'exclusivité : il avait fallu l'expliquer en toutes lettres sur chaque
     carte, et gérer à la main qu'en cocher une décoche l'autre. Des boutons
     radio qui partagent le même nom portent la règle dans leur nature — le
     navigateur décoche l'autre, il n'y a rien à écrire et rien à expliquer.

     Ce que la liste déroulante faisait bien, elle, c'était de montrer le choix
     sans dérouler la page ; le Récapitulatif garde donc une ligne qui rappelle
     où le joker est posé, en lecture seule. */
  const state = matchState(match, now);
  const isFinished = state === 'termine';
  const locked = state !== 'avenir';

  // Un brouillon a la priorite sur ce qui est enregistre ; sinon on repart du
  // pronostic en base, sinon du vide.
  const home = draft?.home ?? prediction?.homeScorePred ?? '';
  const away = draft?.away ?? prediction?.awayScorePred ?? '';
  const complete = home !== '' && away !== '';
  const dirty =
    complete &&
    (!prediction || prediction.homeScorePred !== home || prediction.awayScorePred !== away);

  /**
   * Trois etats, et un seul mot pour les dire.
   *
   * Avant, tous les matchs ouverts portaient le meme liseré orange et la meme
   * etiquette « Ouvert ». Un signal present partout ne signale rien : on ne
   * distinguait pas un prono enregistre d'un prono seulement saisi, et l'on
   * pouvait remplir ses sept matchs, oublier de valider, et le decouvrir au
   * classement.
   *
   * Desormais l'orange est reserve a ce qui demande une action.
   */
  const etat = dirty
    ? { libelle: 'non validé', chip: 'bg-amber-500/20 text-amber-500 border border-amber-500/45' }
    : prediction
    ? { libelle: 'enregistré', chip: 'bg-green-500/15 text-green-400 border border-green-500/40' }
    : { libelle: 'à faire', chip: 'chip-accent' };

  const bordure = locked
    ? ''
    : dirty
    ? 'border-l-4 border-l-amber-500'
    : prediction
    ? 'border-l-4 border-l-green-500/70'
    : 'border-l-4 border-l-slate-600';

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState(null);
  const [loadingOthers, setLoadingOthers] = useState(false);

  const toggleOthers = async () => {
    const opening = !showOthers;
    setShowOthers(opening);
    if (opening && others === null) {
      setLoadingOthers(true);
      try {
        const res = await api.get(`/predictions/match/${match.id}`);
        setOthers(res.data);
      } catch {
        setOthers([]);
      } finally {
        setLoadingOthers(false);
      }
    }
  };

  const handleSave = async () => {
    if (!complete) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/predictions', {
        matchId: match.id,
        homeScorePred: home,
        awayScorePred: away,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setOthers(null);
      onPredictionSaved?.(match.id, res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const [jokerEnCours, setJokerEnCours] = useState(false);

  /**
   * Le joker se pose en un seul geste, même si le pronostic n'est pas validé.
   *
   * Le serveur exige un pronostic enregistré avant d'accepter un joker, et il a
   * raison : un joker se pose sur un pari, pas sur une case vide. Mais avec le
   * contrôle dans la carte, le geste naturel devient « je saisis mon score et
   * je coche le joker » — et refuser ce geste pour une raison d'ordre interne
   * serait incompréhensible.
   *
   * On enregistre donc le pronostic d'abord, puis on pose le joker. Deux
   * requêtes, un seul clic. Les deux scores doivent être remplis : sans eux il
   * n'y a rien à enregistrer, et le bouton reste inactif.
   */
  const poserJoker = async () => {
    if (estJoker || !complete || jokerEnCours) return;
    setJokerEnCours(true);
    setError('');
    try {
      if (dirty || !prediction) {
        const res = await api.post('/predictions', {
          matchId: match.id,
          homeScorePred: home,
          awayScorePred: away,
        });
        onPredictionSaved?.(match.id, res.data);
      }
      await onJoker?.(match.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setJokerEnCours(false);
    }
  };

  /**
   * Retirer le joker.
   *
   * Un bouton radio ne se décoche pas : sans ce lien, un joker posé ne pourrait
   * plus que se déplacer, jamais disparaître. Le serveur traite la pose et le
   * retrait avec le même appel — rappeler la bascule sur le match où le joker
   * se trouve l'enlève.
   */
  const retirerJoker = async () => {
    if (!estJoker || jokerEnCours) return;
    setJokerEnCours(true);
    setError('');
    try {
      await onJoker?.(match.id);
    } finally {
      setJokerEnCours(false);
    }
  };

  /**
   * Pourquoi le bouton ne répond pas.
   *
   * Un contrôle grisé qui ne s'explique pas se lit comme une panne, et c'est le
   * reproche qu'on faisait à l'ancienne case à cocher. Chaque refus a donc sa
   * phrase, et l'ordre compte : on dit la raison la plus forte d'abord, celle
   * qui ne se lèvera pas en remplissant un champ.
   */
  const jokerBloque =
    jokerFige ? (estJoker
      ? 'Cette rencontre a commencé : ton joker y reste.'
      : 'Ton joker est engagé sur un match commencé : il ne peut plus bouger.')
    : locked ? 'Cette rencontre a commencé.'
    : !complete ? 'Saisis les deux scores pour pouvoir y poser ton joker.'
    : null;

  // La rangée reste affichée sur un match commencé qui porte le joker : sinon
  // le groupe n'aurait plus aucun bouton coché et l'on ne saurait plus où il
  // est.
  const montreJoker = reglesActives && !estAffiche && (!locked || estJoker);

  const dateStr = format(new Date(match.kickoff), "EEEE d MMMM · HH'h'mm", { locale: fr });
  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  return (
    <div className={`card stitched ${bordure}`}>
      {/* En-tête

          Date, heure et diffuseur sur la même ligne, à gauche : ce sont les
          trois réponses à la même question — quand, et sur quelle chaîne. Le
          groupe peut passer à la ligne sur les petits écrans plutôt que de
          pousser l'étiquette d'état hors du cadre.

          Le diffuseur ne s'affiche qu'avant le coup d'envoi. Après, savoir sur
          quelle chaîne le match a été diffusé n'apprend plus rien, et la place
          revient au score. */}
      <div className="relative z-10 flex items-center justify-between gap-2 flex-wrap mb-3">
        {/* À gauche, quand et sur quelle chaîne : deux réponses à la même
            question, elles vont ensemble. */}
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[11.5px] italic text-slate-500 first-letter:uppercase">{dateStr}</span>
          {match.broadcaster && state === 'avenir' && (
            <span
              title={`Diffusion : ${match.broadcaster}`}
              className="font-display text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                         bg-slate-700/40 text-slate-400 border border-slate-700 whitespace-nowrap"
            >
              📺 {match.broadcaster}
            </span>
          )}
        </span>

        {/* À droite, ce qui concerne le pronostic : les multiplicateurs puis
            l'état. Les multiplicateurs étaient à gauche, coincés entre l'heure
            et le diffuseur — au milieu des informations sur la rencontre, alors
            qu'ils parlent de ce que rapporte le pari. L'état reste à
            l'extrême droite, là où l'œil a pris l'habitude de le trouver.

            Fonds pleins et non teintés : un aplat violet ou ambre avec du texte
            blanc ou noir se lit sur les deux thèmes. La version précédente
            posait du violet clair sur un voile transparent — correct sur fond
            nuit, illisible sur le fond crème. */}
        <span className="flex items-center gap-1.5 flex-wrap justify-end">
          {estAffiche && (
            <span title="Match de la semaine : tous les points de cette rencontre sont multipliés par 3" style={PASTILLE.affiche}>
              ⭐ Affiche ×3
            </span>
          )}
          {estJoker && (
            <span title="Ton joker est posé ici : tes points sur cette rencontre sont doublés" style={PASTILLE.joker}>
              🃏 Joker ×2
            </span>
          )}

          {state === 'avenir' ? (
            <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${etat.chip}`}>
              {etat.libelle}
            </span>
          ) : (
            <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 ${STATE_CHIP[state]}`}>
              {state === 'encours' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {STATE[state].label}
            </span>
          )}
        </span>
      </div>

      {/* Affiche

          Les noms d'équipes ne sont plus tronqués : ils passent à la ligne.

          Cette rangée range six choses sur une seule ligne — nom, écusson,
          score, tiret, écusson, nom — et quatre d'entre elles ont une largeur
          fixe qui ne se comprime pas. Sur un téléphone en portrait il restait
          une centaine de pixels par nom, là où « Stade Français Paris » en gras
          en demande le triple : on lisait « Stade… » et « Mont… », ce qui ne
          désigne plus personne.

          Couper n'était donc pas un réglage malheureux mais la seule issue
          laissée à une ligne qui demandait trop. On lui rend la hauteur : plus
          de `truncate`, les noms se replient.

          Reste à dire **où** ils ont le droit de se replier, et c'est là que la
          première correction s'est trompée. Elle employait
          `overflow-wrap:anywhere`, qui autorise la coupure à l'intérieur des
          mots — et surtout, qui fait croire au moteur de mise en page que la
          colonne peut se réduire à une lettre. Le calcul de largeur partait
          donc d'une colonne minuscule, et l'on obtenait « Montp / ellier / HR »
          et « Vanne / s ». Un nom propre coupé au milieu se lit plus mal que le
          nom tronqué qu'on venait de supprimer.

          `break-words` dit l'inverse : la colonne ne peut pas descendre sous la
          largeur de son mot le plus long, donc la mise en page lui réserve la
          place, et la coupure intérieure ne survient qu'en dernier recours —
          pour un mot qui, seul, ne tiendrait pas. Les noms se replient alors
          entre les mots, « Stade Français / Paris », comme on les écrirait.

          Le corps passe à 13,5 pixels sur téléphone et retrouve ses 15,5 à
          partir des écrans moyens. C'est la condition pour que « Montpellier »,
          le plus long mot d'un nom de club du championnat, tienne dans la
          centaine de pixels que lui laissent les scores et les écussons. Sur
          ordinateur rien ne change.
          Les deux noms sont alignés par le haut sur téléphone, et seulement
          là. C'est le second défaut qu'avait révélé l'usage : avec un
          alignement centré, « Stade Français Paris » sur trois lignes et
          « Montpellier HR » sur deux ne commençaient pas à la même hauteur,
          chaque colonne étant centrée sur elle-même. Alignés par le haut, les
          premières lignes des deux noms tombent en regard, ce qui est la seule
          chose qu'on lise vraiment. Sur les écrans où les noms tiennent sur une
          ligne, l'alignement centré d'origine reprend la main.

          */}
      <div className="relative z-10 flex items-start sm:items-center gap-2.5 sm:gap-4">
        <div className="flex-1 min-w-0 flex items-start sm:items-center justify-end gap-2.5">
          <div className="min-w-0 text-right">
            <p className="break-words font-display font-bold text-[13.5px] sm:text-[15.5px] leading-tight">{match.homeTeam.name}</p>
            <p className="break-words text-[10px] sm:text-[10.5px] italic text-slate-500 mt-0.5">{match.venue || match.homeTeam.city}</p>
          </div>
          <TeamCrest team={match.homeTeam} size={28} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isFinished ? (
            <>
              <span className={`font-display font-extrabold text-[29px] leading-none tabular-nums ${homeWon ? 'text-amber-400' : ''}`}>
                {match.homeScore}
              </span>
              <span className="text-slate-500 text-base">–</span>
              <span className={`font-display font-extrabold text-[29px] leading-none tabular-nums ${awayWon ? 'text-amber-400' : ''}`}>
                {match.awayScore}
              </span>
            </>
          ) : (
            <>
              <ScoreInput value={home} onChange={(v) => onDraftChange(match.id, 'home', v)} disabled={locked} />
              <span className="text-slate-500 text-base">–</span>
              <ScoreInput value={away} onChange={(v) => onDraftChange(match.id, 'away', v)} disabled={locked} />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-start sm:items-center gap-2.5">
          <TeamCrest team={match.awayTeam} size={28} />
          <div className="min-w-0">
            <p className="break-words font-display font-bold text-[13.5px] sm:text-[15.5px] leading-tight">{match.awayTeam.name}</p>
            <p className="break-words text-[10px] sm:text-[10.5px] italic text-slate-500 mt-0.5">{match.awayTeam.city}</p>
          </div>
        </div>
      </div>

      {/* Ton pronostic + points */}
      {isFinished && prediction && (
        <div className="relative z-10 mt-3.5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] text-slate-400">
            Ton pronostic{' '}
            <b className="font-display text-sm text-white">
              {prediction.homeScorePred} – {prediction.awayScorePred}
            </b>
          </span>
          <PointsBadge prediction={prediction} />
        </div>
      )}

      {/* Saisie */}
      {!locked && (
        <div className="relative z-10 mt-3.5 pt-3 border-t border-slate-800 flex items-center gap-3 flex-wrap">
          {/* Le bouton ne s'affiche que s'il a quelque chose a faire.

              Il portait « Modifier » en grise tant que rien n'avait change.
              L'etiquette promettait une action — « clique ici pour modifier » —
              alors qu'elle en decrivait une autre : « enregistrer la
              modification ». On cliquait donc dessus sans effet, et l'on en
              concluait qu'un prono enregistre ne se modifiait plus.

              Un bouton grise qui ne s'explique pas est toujours un piege. Ici
              il disparait, et une phrase dit quoi faire. */}
          {(dirty || !prediction || saving || saved) && (
            <button
              onClick={handleSave}
              disabled={saving || !complete}
              className="btn-primary text-[13px] py-2"
            >
              {saving
                ? '…'
                : saved
                ? '✅ Enregistré'
                : prediction
                ? 'Enregistrer la modification'
                : 'Valider'}
            </button>
          )}

          {dirty && !saving && !saved && (
            <span className="font-display text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/20 text-amber-500 border border-amber-500/45">
              non enregistré
            </span>
          )}
          {!dirty && prediction && !saving && !saved && (
            <span className="text-[11.5px] text-slate-500">
              Enregistré&nbsp;: <b className="text-slate-400">{prediction.homeScorePred}–{prediction.awayScorePred}</b>
              {' · '}change un score pour le modifier
            </span>
          )}
          {error && <span className="text-[11.5px] text-red-400">{error}</span>}

        </div>
      )}

      {locked && !isFinished && prediction && (
        <div className="relative z-10 mt-2.5 text-[12.5px] text-slate-400">
          Pronostic enregistré{' '}
          <b className="font-display text-sm text-white">
            {prediction.homeScorePred} – {prediction.awayScorePred}
          </b>
        </div>
      )}

      {/* Le joker, dans la boîte du pronostic.

          Un bouton radio, et tous ceux de la journée partagent le même `name` :
          l'unicité du joker devient une propriété du navigateur au lieu d'une
          règle qu'on applique à la main. Le match de l'affiche n'a pas de bouton
          du tout — le joker y est interdit puisqu'il est déjà multiplié par
          trois pour tout le monde — et une mention le dit, pour qu'on ne cherche
          pas un contrôle manquant.

          L'accent violet est celui de la pastille « Joker ×2 » de l'en-tête :
          le contrôle et son résultat se reconnaissent. */}
      {montreJoker && (
        <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
            <label
              className={`flex items-center gap-2 text-[12.5px] ${
                jokerBloque ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={`joker-j${match.round}`}
                checked={estJoker}
                disabled={!!jokerBloque || jokerEnCours}
                onChange={poserJoker}
                className="w-4 h-4 shrink-0 accent-violet-600 cursor-[inherit]
                           focus:outline-none focus:ring-2 focus:ring-violet-600/40"
              />
              <span className={estJoker ? 'font-semibold' : 'text-slate-400'}>
                🃏 Mon joker ici <span className="text-slate-500">· points ×2</span>
              </span>
            </label>

            {estJoker && !jokerFige && !jokerEnCours && (
              <button
                type="button"
                onClick={retirerJoker}
                className="text-[11.5px] text-slate-500 underline transition-colors hover:text-amber-400"
              >
                retirer
              </button>
            )}

            {jokerEnCours && <span className="text-[11.5px] text-slate-500">…</span>}
          </div>

          {jokerBloque && (
            <p className="text-[11.5px] text-slate-500 mt-1.5">{jokerBloque}</p>
          )}
          {jokerErreur && (
            <p className="text-[11.5px] text-red-400 mt-1.5">{jokerErreur}</p>
          )}
        </div>
      )}

      {reglesActives && estAffiche && !isFinished && (
        <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
          <p className="text-[11.5px] text-slate-500">
            ⭐ Affiche de la journée : déjà multipliée par trois pour tout le monde, le joker ne s'y pose pas.
          </p>
        </div>
      )}

      {/* De quoi pronostiquer : la forme des deux clubs, puis les compositions.

          Dans cet ordre, et c'est réfléchi. La forme est toujours visible parce
          qu'on la veut sous les yeux pendant qu'on saisit un score ; les
          compositions sont repliées parce que quatre-vingt-douze noms sur sept
          cartes rendraient la page illisible pour la seule personne qui veut
          vérifier si le buteur est titulaire.

          Les deux blocs disparaissent complètement quand il n'y a rien à
          montrer — aucune journée jouée, ou composition pas encore publiée par
          la LNR. Il n'y a donc rien à prévoir pour le mardi ni pour le début de
          saison : la carte reste exactement comme avant.

          Ils sont placés après le pronostic et avant les pronos des autres :
          ce qui aide à décider vient avant ce qui raconte ce que les autres ont
          décidé. */}
      <FormeClubs match={match} />
      <CompositionsMatch match={match} />

      {/* Pronostics des autres joueurs */}
      <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={toggleOthers}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition-colors"
        >
          <span className={`text-[9px] text-amber-500 transition-transform ${showOthers ? 'rotate-90' : ''}`}>▶</span>
          Pronos des joueurs
          {others && <span className="text-slate-600">({others.length})</span>}
        </button>

        {showOthers && (
          <div className="mt-2.5">
            {loadingOthers ? (
              <p className="text-xs text-slate-600 animate-pulse">Chargement…</p>
            ) : !others || others.length === 0 ? (
              <p className="text-xs text-slate-600">Aucun pronostic pour ce match.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {others.map((p, i) => {
                  const isMe = p.user.id === user?.id;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] ${
                        isMe
                          ? 'bg-amber-500/10 shadow-[inset_2px_0_0_rgb(var(--a-500))]'
                          : i % 2 === 0
                          ? 'bg-amber-500/[.04]'
                          : ''
                      }`}
                    >
                      <span
                        className="w-[7px] h-[7px] rounded-full shrink-0"
                        style={{ backgroundColor: p.user.avatarColor }}
                      />
                      <span className={`truncate ${isMe ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
                        {p.user.username}
                        {isMe && ' (toi)'}
                      </span>
                      <span className="ml-auto font-display font-bold text-[13.5px] tabular-nums shrink-0">
                        {p.homeScorePred} – {p.awayScorePred}
                      </span>
                      <PointsChip prediction={p} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
