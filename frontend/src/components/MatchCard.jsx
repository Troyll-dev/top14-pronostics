import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import TeamCrest from './TeamCrest';
import { matchState, STATE, STATE_CHIP } from '../utils/matchState';
import CompositionsMatch from './CompositionsMatch';
import FormeClubs from './FormeClubs';
import IconeJoker from './IconeJoker';
import IconeAffiche from './IconeAffiche';

/**
 * La case de score.
 *
 * Champ texte, pas champ nombre, et c'est délibéré.
 *
 * `type="number"` affichait deux petites flèches haut/bas à droite du champ.
 * Elles mangeaient la place et décentraient le chiffre, pour un service que
 * personne ne demande : on ne saisit pas un score de rugby en cliquant
 * vingt-sept fois sur une flèche.
 *
 * Elles emportaient surtout un piège discret. Sur un champ nombre qui a le
 * focus, la molette de la souris change la valeur. Avec sept cartes à faire
 * défiler, il suffisait de cliquer dans une case puis de continuer à dérouler
 * la page pour modifier un score sans s'en apercevoir — et l'enregistrer
 * ensuite en croyant valider ce qu'on avait tapé.
 *
 * `inputMode="numeric"` conserve le pavé numérique sur téléphone, qui était le
 * seul vrai apport du champ nombre. Le filtre ne garde que les chiffres : ni
 * signe, ni virgule, ni exponentielle — autant de choses qu'un champ nombre
 * acceptait et que le serveur devait refuser ensuite.
 *
 * La borne haute reste côté serveur, où elle fait foi ; ici on se contente de
 * trois chiffres, qui est la largeur du champ.
 */
function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={3}
      value={value}
      // On laisse passer la chaine vide : convertir tout de suite afficherait
      // un 0 des que l'on efface le champ.
      onChange={(e) => {
        const chiffres = e.target.value.replace(/\D/g, '').slice(0, 3);
        onChange(chiffres === '' ? '' : Number(chiffres));
      }}
      disabled={disabled}
      className="w-9 h-9 sm:w-[52px] sm:h-11 text-center font-display text-base sm:text-xl font-bold tabular-nums
                 bg-slate-950 border-[1.5px] border-slate-800 rounded-md text-white
                 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25
                 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
    />
  );
}

/**
 * L'écusson, plus petit sur téléphone.
 *
 * Six pixels de moins de chaque côté, et ce sont douze pixels rendus aux noms
 * d'équipes — sur une rangée où il en restait quatre-vingts par nom, ça compte.
 * `TeamCrest` prend sa taille en propriété, qui ne peut pas varier avec la
 * largeur de l'écran : on en pose donc deux, dont une seule est affichée. Celle
 * qui ne l'est pas est retirée du flux et ne charge rien de plus, les deux
 * pointant vers la même image.
 */
function Ecusson({ team }) {
  return (
    <>
      <span className="sm:hidden"><TeamCrest team={team} size={22} /></span>
      <span className="hidden sm:block"><TeamCrest team={team} size={28} /></span>
    </>
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
  padding: '3px 7px',
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


/**
 * La météo du coup d'envoi, en texte et non plus en pastille.
 *
 * Ce qu'elle dit et ce qu'elle tait n'a pas changé. Température, temps, vent —
 * dans cet ordre, du plus attendu au plus décisif. La pluie n'apparaît que s'il
 * y en a : « 0 mm » sur six cartes sur sept est du bruit, et l'absence de
 * mention se lit très bien comme « il ne pleut pas ».
 *
 * Un vent au-delà de vingt-cinq kilomètres-heure ou une pluie au-delà d'un
 * millimètre changent un match de rugby — les buteurs manquent, le jeu au pied
 * devient un pari, les scores baissent. Ces deux cas passent en ambre ; le
 * reste est une information de confort et reste gris.
 *
 * Ce qui change, c'est l'habillage : plus de cadre ni de fond. Trois encadrés
 * côte à côte — date, diffuseur, météo — finissaient par occuper trois rangées
 * sur un téléphone et repoussaient le match hors de l'écran. Le cadre coûtait
 * donc très cher pour une information qu'on lit en diagonale. En texte simple,
 * les trois tiennent sur une ligne, et l'ambre suffit à faire ressortir le seul
 * cas qui mérite l'œil.
 *
 * Rend `null` quand il n'y a rien à dire, et un libellé « météo bientôt » pour
 * une rencontre lointaine : sans lui, une carte sans météo à côté de six qui en
 * ont une ressemble à une panne.
 */
function infoMeteo(match, state) {
  if (state !== 'avenir') return null;

  if (!match.meteo) {
    const jours = (new Date(match.kickoff) - Date.now()) / 86400000;
    if (jours <= 10) return null;   // relevée sous peu, inutile de l'annoncer
    return {
      texte: 'météo bientôt',
      notable: false,
      attente: true,
      title: 'Aucune prévision fiable au-delà de dix jours : elle apparaîtra en approchant.',
    };
  }

  const { temperature, libelle, vent, pluie, heure } = match.meteo;
  const notable = vent >= 25 || pluie >= 1;

  const quand = heure
    ? new Date(heure).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const releve = match.meteoAt
    ? new Date(match.meteoAt).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const texte =
    `${temperature} °C · ${libelle}` +
    (pluie >= 1 ? ` · ${pluie} mm` : '') +
    ` · ${vent} km/h`;

  return {
    texte,
    notable,
    title:
      `Prévision à l'heure du coup d'envoi${quand ? ` (${quand})` : ''}` +
      (releve ? `, relevée le ${releve}` : ''),
  };
}

/**
 * Une seule chaîne, et écrite court.
 *
 * La LNR annonce parfois plusieurs diffuseurs pour la même rencontre, et la
 * source les assemblait tels quels : « Canal + / Canal + Live ». Vingt-deux
 * caractères pour dire une chose, dont la moitié répète l'autre — sur une ligne
 * qui se tronque, c'est la météo qui en faisait les frais.
 *
 * On garde la plus longue, qui est la plus précise : entre « Canal + » et
 * « Canal + Live », la seconde dit le canal exact. Et l'on resserre l'espace
 * avant le plus, parce que les chaînes s'écrivent « Canal+ » partout sauf dans
 * les fichiers de la ligue.
 *
 * Ce n'est pas corrigé côté serveur à dessein : la base garde ce que la source
 * annonce, entier et fidèle. C'est l'affichage qui choisit ce qui tient sur une
 * ligne de téléphone.
 */
function chaine(brut) {
  const parts = String(brut || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const choisie = parts.reduce((a, b) => (b.length > a.length ? b : a));
  return choisie.replace(/\s*\+/g, '+');
}

/**
 * Le stade de chaque club, quand la rencontre n'en annonce pas.
 *
 * La source renseigne `venue` pour certaines rencontres seulement : Castres–
 * Stade Français n'en a pas, par exemple. La carte affichait jusqu'ici la ville
 * à la place, sous le nom du club recevant — ce qui masquait le trou, puisque
 * « Castres » ressemble à une réponse. En remontant le stade sur sa propre
 * ligne, le trou est devenu visible, et il fallait le combler plutôt que
 * d'afficher une ligne à moitié vide.
 *
 * Quatorze lignes, rangées par le nom du club tel qu'il existe en base — les
 * mêmes noms que la table de correspondance de la source LNR. Le `venue` de la
 * rencontre garde la priorité : il couvre les délocalisations, qu'aucune table
 * ne peut prévoir. Celle-ci ne sert que de repli, et un club absent ne fait
 * rien échouer : la ligne se contente alors de la météo.
 *
 * À reprendre à chaque montée ou descente, et quand un sponsor rebaptise une
 * enceinte. C'est la seule donnée de ce fichier qui vieillit toute seule.
 */
const STADE_PAR_CLUB = {
  'Stade Toulousain': 'Stade Ernest-Wallon',
  'Castres Olympique': 'Stade Pierre-Fabre',
  'Stade Français Paris': 'Stade Jean-Bouin',
  'Union Bordeaux-Bègles': 'Stade Chaban-Delmas',
  'Stade Rochelais': 'Stade Marcel-Deflandre',
  'LOU Rugby': 'Matmut Stadium de Gerland',
  'RC Toulon': 'Stade Mayol',
  'Racing 92': 'Paris La Défense Arena',
  'ASM Clermont': 'Stade Marcel-Michelin',
  'Section Paloise': 'Stade du Hameau',
  'Aviron Bayonnais': 'Stade Jean-Dauger',
  'Montpellier HR': 'GGL Stadium',
  'USA Perpignan': 'Stade Aimé-Giral',
  'RC Vannes': 'Stade de la Rabine',
};

const nomStade = (match) =>
  match.venue || STADE_PAR_CLUB[match.homeTeam?.name] || null;

/**
 * L'encadré du diffuseur et de la météo.
 *
 * Ils étaient encadrés, ils le restent. Une première version les avait passés
 * en texte simple pour gagner de la hauteur ; c'était se tromper de cause. Ce
 * qui coûtait de la hauteur, c'était qu'ils s'empilent au-dessus du match, pas
 * qu'ils aient un cadre. Une fois l'affiche en tête de carte, le cadre ne coûte
 * plus rien — et il rend un vrai service : c'est lui qui permet à la météo de
 * passer en ambre quand il pleut ou qu'il vente, ce qu'une couleur de texte
 * seule ne fait pas assez voir.
 */
const ENCADRE =
  'font-display text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 ' +
  'rounded border whitespace-nowrap';
const ENCADRE_NEUTRE = 'bg-slate-700/40 text-slate-400 border-slate-700';
const ENCADRE_ALERTE = 'bg-amber-500/15 text-amber-500 border-amber-500/40';
const ENCADRE_ATTENTE = 'bg-slate-800/40 text-slate-600 border-slate-800';

/**
 * Les scores saisis ne vivent plus dans cette carte mais dans MatchesPage,
 * qui les sauvegarde dans le navigateur et sait tout valider d'un coup.
 * La carte est donc pilotee par `draft` et remonte chaque frappe.
 */
export default function MatchCard({
  match, draft, onDraftChange, onPredictionSaved, now = Date.now(),
  regles = null, onJoker = null, jokerFige = false, jokerErreur = '',
  onSuivant = null,
}) {
  // Plus de `useAuth` ici : l'identite du joueur ne servait qu'a reperer sa
  // propre ligne dans la liste des pronos des autres, partie vers la page
  // « Resultats ». Une dependance de moins pour la carte.
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
   * Trois etats, et un seul endroit pour les dire : le liseré de la carte.
   *
   * Avant, tous les matchs ouverts portaient le meme liseré orange et la meme
   * etiquette « Ouvert ». Un signal present partout ne signale rien : on ne
   * distinguait pas un prono enregistre d'un prono seulement saisi, et l'on
   * pouvait remplir ses sept matchs, oublier de valider, et le decouvrir au
   * classement.
   *
   * Desormais l'orange est reserve a ce qui demande une action, et il n'y a
   * plus d'etiquette en tete de carte pour le repeter : le liseré donne l'etat
   * d'un coup d'oeil sur les sept cartes a la fois, ce qu'une pastille par
   * carte ne fait pas, et la rangee de saisie dit le detail la ou l'on agit.
   */
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
      onPredictionSaved?.(match.id, res.data);
      // Puis la page fait défiler jusqu'au prochain match à pronostiquer.
      // Seulement ici, après un clic sur « Valider » : ni « Tout valider » ni
      // la pose du joker n'appellent cette fonction, et c'est voulu — dans ces
      // deux cas on n'est pas en train d'avancer d'une carte à la suivante.
      onSuivant?.(match.id);
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

  /**
   * Le score manque : la seule raison de refus qui change **pendant la frappe**.
   *
   * Elle avait sa propre ligne sous le joker, comme les autres. Mais elle est
   * la seule à apparaître et disparaître au fil des chiffres : on tape le
   * premier score, la ligne est là ; on tape le second, elle s'en va, et la
   * carte raccourcit sous le pouce au moment précis où l'on vise une case.
   *
   * Elle se dit donc dans la rangée elle-même, à la place de « points ×2 » et
   * dans la même longueur — trois mots, pour ne jamais passer à la ligne sur un
   * téléphone. La hauteur de la carte ne dépend plus de ce qu'on est en train
   * de taper. Les autres refus — match commencé, joker figé — gardent leur
   * ligne : ils ne changent pas pendant qu'on saisit.
   */
  const scoreManquant = !jokerFige && !locked && !complete;

  // La rangée reste affichée sur un match commencé qui porte le joker : sinon
  // le groupe n'aurait plus aucun bouton coché et l'on ne saurait plus où il
  // est.
  const montreJoker = reglesActives && !estAffiche && (!locked || estJoker);

  const dateStr = format(new Date(match.kickoff), "EEEE d MMMM · HH'h'mm", { locale: fr });
  const meteo = infoMeteo(match, state);
  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  /**
   * Les deux cases de score, construites ici et posées dans les deux
   * dispositions.
   *
   * Le même élément React sert aux deux : la version téléphone et la version
   * ordinateur ne peuvent donc pas diverger, et il n'y a qu'un seul endroit à
   * reprendre le jour où l'on touche à la saisie. Celle qui n'est pas affichée
   * est retirée du flux par `display:none`, donc elle n'attrape ni le clavier
   * ni la tabulation.
   */
  const caseScore = (cote) => {
    if (isFinished) {
      const gagne = cote === 'home' ? homeWon : awayWon;
      return (
        <span className={`font-display font-extrabold text-[29px] leading-none tabular-nums ${gagne ? 'text-amber-400' : ''}`}>
          {cote === 'home' ? match.homeScore : match.awayScore}
        </span>
      );
    }
    return (
      <ScoreInput
        value={cote === 'home' ? home : away}
        onChange={(v) => onDraftChange(match.id, cote, v)}
        disabled={locked}
      />
    );
  };
  const caseHome = caseScore('home');
  const caseAway = caseScore('away');

  return (
    // `id` pour que la page puisse faire défiler jusqu'à cette carte ;
    // `scroll-mt-24` pour qu'elle s'arrête sous la barre de navigation, qui
    // reste fixée en haut et la masquerait sinon.
    <div id={`match-${match.id}`} className={`card stitched scroll-mt-24 ${bordure}`}>
      {/* LES PASTILLES, EN TÊTE DE CARTE — QUAND IL Y EN A.

          Ce qui qualifie la rencontre tout entière : l'affiche de la journée,
          multipliée par trois pour tout le monde ; le joker, sur un match où
          sa rangée n'est plus affichée ; et l'état du match une fois le coup
          d'envoi passé — « en cours », « terminé ».

          Au-dessus du match et non à côté de la date : ces pastilles disent
          dans quel régime se joue la rencontre, ce qui se lit avant les noms
          des équipes, pas après l'heure. Elles étaient sur la ligne de date,
          où elles décentraient le texte et paraissaient accrochées au hasard.

          La rangée n'existe que si elle a quelque chose à montrer. Sur une
          rencontre ordinaire à venir — cinq ou six des sept de la journée —
          il n'y en a pas, et le match reste la première chose de la carte.
          C'est ce qui rend ce placement acceptable : il ne coûte une ligne
          qu'aux cartes qui ont une raison de se distinguer.

          Centrées, sur l'axe du score, comme tout ce qui entoure l'affiche. */}
      {(estAffiche || (estJoker && !montreJoker) || state !== 'avenir') && (
        <div className="relative z-10 mb-3 flex flex-wrap items-center justify-center gap-1.5">
          {estAffiche && (
            <span
              title="Match de la semaine : tous les points de cette rencontre sont multipliés par 3"
              style={PASTILLE.affiche}
              className="inline-flex items-center gap-1"
            >
              <IconeAffiche taille={18} /> Affiche ×3
            </span>
          )}
          {estJoker && !montreJoker && (
            <span
              title="Ton joker était posé ici : tes points sur cette rencontre sont doublés"
              style={PASTILLE.joker}
              className="inline-flex items-center gap-1"
            >
              <IconeJoker taille={18} /> Joker ×2
            </span>
          )}
          {state !== 'avenir' && (
            <span className={`font-display text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded whitespace-nowrap flex items-center gap-1.5 ${STATE_CHIP[state]}`}>
              {state === 'encours' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {STATE[state].label}
            </span>
          )}
        </div>
      )}

      {/* L'AFFICHE, EN TÊTE DE CARTE.

          Elle était en troisième position, sous l'en-tête. Sur un ordinateur
          l'en-tête tenait sur une ligne et ça ne se voyait pas ; sur un
          téléphone il passait à deux ou trois rangées — date et diffuseur,
          météo, puis joker et état — et la rencontre se retrouvait au milieu de
          la carte, après un tiers d'écran de contexte. On ouvrait « Mes
          pronos » et on ne voyait pas de match.

          On aurait pu comprimer le contexte jusqu'à ce qu'il tienne sur une
          ligne. C'est ce qui est fait juste en dessous, et c'est bien — mais ça
          n'aurait pas suffi : la prochaine information ajoutée aurait recréé le
          problème, et on serait revenu rogner ailleurs. En mettant l'affiche en
          premier, plus rien ne peut la repousser, quel que soit le nombre de
          pastilles et quelle que soit la largeur de l'écran. Le défaut n'est
          pas contenu, il est supprimé.

          Les deux équipes face à face, à toutes les largeurs. Ça n'a pas été
          évident : la rangée range six choses dont quatre ont une largeur fixe,
          et sur un écran de 390 pixels il n'en restait qu'une centaine par nom.
          On a d'abord tronqué — « Stade… », qui ne désigne personne — puis
          replié n'importe où — « Montp / ellier » — puis renoncé en passant à
          une équipe par ligne.

          Ce qui la rend tenable, c'est d'avoir rendu de la place au lieu d'en
          demander aux noms. Les cases de score passent de 52 à 36 pixels sur
          téléphone, les écussons de 28 à 22, les espacements se resserrent :
          une cinquantaine de pixels récupérés, répartis sur les deux noms. Sur
          les écrans moyens et au-delà, tout reprend ses dimensions d'origine.

          Les noms se replient alors **entre les mots** et jamais à l'intérieur
          de l'un d'eux. C'est `break-words` qui le garantit : il interdit à la
          mise en page de réduire la colonne sous la largeur de son mot le plus
          long. Mesuré sur le pire cas du championnat, « Montpellier », avec une
          police plus large que celle du site : il tient. */}
      <div className="relative z-10 flex items-start sm:items-center gap-[5px] sm:gap-4">
        <div className="flex-1 min-w-0 flex items-start sm:items-center justify-end gap-[5px] sm:gap-2.5">
          <div className="min-w-0 text-right">
            <p className="break-words font-display font-bold text-[11.5px] sm:text-[15.5px] leading-tight">
              {match.homeTeam.name}
            </p>
            {/* La ville, et non plus le stade.

                Le nom du stade est remonté sur la ligne de contexte, où il a
                la largeur de la carte. Ici il était dans la colonne la plus
                étroite de la page — « Stade Ernest-Wallon » sur quatre-vingts
                pixels, sous un nom d'équipe qui occupe déjà deux lignes — et
                il repliait tout. La ville suffit à cet endroit : elle dit d'où
                vient le club, ce qui est la question qu'on se pose en lisant
                son nom. */}
            <p className="break-words text-[9.5px] sm:text-[10.5px] italic text-slate-500 mt-0.5">
              {match.homeTeam.city}
            </p>
          </div>
          <Ecusson team={match.homeTeam} />
        </div>

        <div className="self-center flex items-center gap-1 sm:gap-2 shrink-0">
          {caseHome}
          <span className="text-slate-500 text-sm sm:text-base">–</span>
          {caseAway}
        </div>

        <div className="flex-1 min-w-0 flex items-start sm:items-center gap-[5px] sm:gap-2.5">
          <Ecusson team={match.awayTeam} />
          <div className="min-w-0">
            <p className="break-words font-display font-bold text-[11.5px] sm:text-[15.5px] leading-tight">
              {match.awayTeam.name}
            </p>
            <p className="break-words text-[9.5px] sm:text-[10.5px] italic text-slate-500 mt-0.5">
              {match.awayTeam.city}
            </p>
          </div>
        </div>
      </div>

      {/* LE CONTEXTE, SUR DEUX LIGNES CENTRÉES SOUS L'AFFICHE.

          La première dit **quand** on regarde : la date et l'heure, puis la
          chaîne dans son encadré. La seconde dit **où et par quel temps** : le
          stade, puis la météo dans le sien. Ce ne sont pas des informations
          qu'on lit au même moment — l'heure en arrivant sur la page, le vent au
          moment d'écrire un score.

          Centrées, parce que l'affiche au-dessus est symétrique de part et
          d'autre du score : alignées à gauche, elles tiraient l'œil hors de
          l'axe que la rencontre vient d'installer.

          **Pas de troncature.** Une version intermédiaire coupait ces lignes
          par des points de suspension pour qu'elles ne passent jamais à la
          ligne. C'était protéger le match d'un contexte trop long — mais le
          match est désormais en tête de carte, rien ne peut plus le repousser,
          et la troncature ne faisait plus que cacher de l'information. Quand
          une ligne est trop longue, elle se replie **entre** les morceaux,
          jamais à l'intérieur : chacun porte `whitespace-nowrap`.

          Le diffuseur et la météo ne s'affichent qu'avant le coup d'envoi.
          Après, savoir sur quelle chaîne le match passait et qu'il bruinait
          n'apprend plus rien : le score est là. Le stade, lui, reste : il dit
          où la rencontre s'est jouée, ce qui ne périme pas. */}
      <div className="relative z-10 mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="italic whitespace-nowrap inline-block first-letter:uppercase text-[11.5px] text-slate-500">
          {dateStr}
        </span>
        {match.broadcaster && state === 'avenir' && (
          <span title={`Diffusion : ${match.broadcaster}`} className={`${ENCADRE} ${ENCADRE_NEUTRE}`}>
            📺 {chaine(match.broadcaster)}
          </span>
        )}
      </div>

      {/* Deuxième ligne : où, et par quel temps.

          La météo passe en ambre au-delà de vingt-cinq kilomètres-heure de vent
          ou d'un millimètre de pluie : c'est là qu'un match de rugby change de
          nature — les buteurs manquent, le jeu au pied devient un pari, les
          scores baissent. Le reste est une information de confort.

          La ligne disparaît entièrement si elle n'a rien à dire. */}
      {(nomStade(match) || meteo) && (
        <div className="relative z-10 mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {nomStade(match) && (
            <span className="italic whitespace-nowrap text-[11.5px] text-slate-500">{nomStade(match)}</span>
          )}
          {meteo && (
            <span
              title={meteo.title}
              className={`${ENCADRE} ${
                meteo.attente ? ENCADRE_ATTENTE : meteo.notable ? ENCADRE_ALERTE : ENCADRE_NEUTRE
              }`}
            >
              {meteo.texte}
            </span>
          )}
        </div>
      )}

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
        /* Hauteur minimale réservée : celle du bouton.

           Cette rangée change de contenu au fil de la frappe — la pastille
           « Enregistré » et sa phrase, puis le bouton « Enregistrer la
           modification » dès qu'on touche un chiffre. Les deux n'ont pas la
           même hauteur, et la carte bougeait d'une quinzaine de pixels à la
           première frappe. On réserve la plus grande des deux : 12 pixels de
           marge, 36 de bouton, 1 de trait. */
        <div className="relative z-10 mt-3.5 pt-3 min-h-[49px] border-t border-slate-800 flex items-center gap-3 flex-wrap">
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

          {/* Le pronostic est enregistré : la pastille et sa phrase, sur la
              même rangée.

              Cette phrase avait une ligne à elle, sous un trait, pour dire
              « change un score pour le modifier » — une ligne entière pour une
              instruction qu'on ne lit qu'une fois dans sa vie. Et la pastille
              verte « Enregistré » vivait en haut de carte, à côté de la date,
              loin de ce qu'elle qualifie.

              Les deux se répondent : l'une dit l'état, l'autre dit comment en
              sortir. Mises côte à côte à l'endroit où l'on tape les scores,
              elles tiennent sur la rangée du bouton — qui est vide dans ce cas
              précis, puisqu'il n'y a rien à enregistrer.

              L'étiquette « non enregistré » du cas inverse, elle, a simplement
              disparu : le bouton porte déjà le mot « Enregistrer » et le liseré
              de la carte est ambre. Trois signaux pour un seul fait. */}
          {!dirty && prediction && !saving && !saved && (
            <>
              <span className="font-display text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded whitespace-nowrap bg-green-500/15 text-green-400 border border-green-500/40">
                Enregistré
              </span>
              <span className="text-[11.5px] text-slate-500">
                change un score pour le modifier
              </span>
            </>
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
              {/* Le bouffon reste à 26 pixels.

                  On a essayé 36, et c'était moins bien. L'icône est posée sur
                  une petite plaque claire qui ne se voit pas à cette taille
                  mais qui apparaît dès qu'on l'agrandit : sur le fond crème,
                  elle devient un cadre gris autour du dessin, et l'on dirait
                  une vignette collée sur la carte plutôt qu'une icône.

                  La leçon n'est pas « 26 vaut mieux que 36 ». C'est que le
                  défaut n'était pas la taille : agrandir n'a fait que révéler
                  ce qu'il y a autour de l'image. Le jour où l'on voudra un
                  bouffon plus présent, c'est l'image qu'il faudra reprendre,
                  pas ce nombre. */}
              <span className={`inline-flex items-center gap-2 ${estJoker ? 'font-semibold' : 'text-slate-400'}`}>
                <IconeJoker taille={26} /> Mon joker ici
                {/* La pastille quand le joker est posé, le texte sinon.

                    Le rectangle violet est une **marque** : il dit « c'est
                    ici ». L'afficher sur les sept cartes, cochées ou non,
                    revenait à marquer partout, donc nulle part — et l'on ne
                    distinguait plus d'un coup d'œil la carte qui porte le
                    joker. Il n'apparaît donc que sur celle-là ; les autres
                    gardent la règle écrite en gris, qui dit ce que ferait le
                    bouton sans prétendre qu'il est enclenché. */}
                {estJoker ? (
                  <span style={PASTILLE.joker} className="inline-flex items-center gap-1">
                    <IconeJoker taille={16} /> Joker ×2
                  </span>
                ) : (
                  <span className="text-slate-500 font-normal whitespace-nowrap">
                    {scoreManquant ? '· score d\'abord' : '· points ×2'}
                  </span>
                )}
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

          {jokerBloque && !scoreManquant && (
            <p className="text-[11.5px] text-slate-500 mt-1.5">{jokerBloque}</p>
          )}
          {jokerErreur && (
            <p className="text-[11.5px] text-red-400 mt-1.5">{jokerErreur}</p>
          )}
        </div>
      )}

      {reglesActives && estAffiche && !isFinished && (
        <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
          <p className="text-[11.5px] text-slate-500 flex items-start gap-1.5">
            <IconeAffiche taille={16} className="mt-[1px]" />
            <span>Affiche de la journée : déjà multipliée par trois pour tout le monde, le joker ne s'y pose pas.</span>
          </p>
        </div>
      )}

      {/* De quoi pronostiquer : la forme des deux clubs, puis les compositions.

          Dans cet ordre, et c'est réfléchi. La forme vient d'abord parce que
          c'est elle qu'on consulte en hésitant sur un score ; les compositions
          sont repliées parce que quatre-vingt-douze noms sur sept cartes
          rendraient la page illisible pour la seule personne qui veut vérifier
          si le buteur est titulaire.

          « Avant de pronostiquer » est ouvert par défaut, y compris sur
          téléphone : on l'a replié une version, puis rouvert — ces chiffres
          servent au moment d'écrire un score, et les déplier sept fois par
          journée coûtait plus que le défilement économisé.

          Les deux blocs disparaissent complètement quand il n'y a rien à
          montrer — aucune journée jouée, ou composition pas encore publiée par
          la LNR. Il n'y a donc rien à prévoir pour le mardi ni pour le début de
          saison : la carte reste exactement comme avant. */}
      <FormeClubs match={match} />
      <CompositionsMatch match={match} />

      {/* Les pronostics des autres joueurs ne sont plus ici.

          Ils vivaient dans un replie au bas de chaque carte : huit lignes pour
          un match, chargees a l'ouverture. La page « Resultats » fait la meme
          chose en mieux — les sept matchs d'un coup, en colonnes, avec les
          couleurs et les totaux —, et le lien « Tous les pronos » se trouve a
          cote du titre de cette page-ci. Le chemin existe, il est a deux clics,
          et les brouillons sont gardes dans le navigateur : on peut aller voir
          et revenir sans perdre ce qu'on tapait.

          Ce qu'on perd, et c'est assume : la comparaison immediate sur CE
          match-la pendant qu'on hesite sur un score. A huit joueurs et sept
          rencontres, ca ne valait pas un bloc dans chaque carte, une requete
          par ouverture, et un second endroit a tenir a jour — deux affichages
          de la meme chose finissent toujours par diverger. */}
    </div>
  );
}
