import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import MatchCard from '../components/MatchCard';
import { matchState, useNow } from '../utils/matchState';
import SelecteurJournee from '../components/SelecteurJournee';
import Bob from '../components/Bob';
import IconeJoker from '../components/IconeJoker';
import FaceAFace from '../components/FaceAFace';
import Bandeau from '../components/Bandeau';

const DRAFT_KEY = 't14-brouillons';
const DRAFT_TTL = 30 * 24 * 3600 * 1000; // un mois

/** Brouillons enregistres dans le navigateur, purges des entrees trop vieilles. */
function loadDrafts() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
    const now = Date.now();
    const kept = {};
    const vide = (x) => x === '' || x === undefined || x === null;
    for (const [id, d] of Object.entries(raw)) {
      if (!d || typeof d !== 'object') continue;
      if (now - (d.t || 0) >= DRAFT_TTL) continue;
      // Purge des brouillons vides deja enregistres par les versions
      // precedentes : ce sont eux qui masquaient des pronostics existants.
      if (vide(d.home) && vide(d.away)) continue;
      kept[id] = d;
    }
    return kept;
  } catch {
    // navigation privee ou stockage bloque : on repart simplement de zero
    return {};
  }
}

/**
 * Où en est mon joker — en lecture seule.
 *
 * Le joker se posait ici, dans une liste déroulante. Il se pose désormais dans
 * la carte du match, avec un bouton radio : l'exclusivité y est portée par le
 * contrôle lui-même au lieu d'être une règle à expliquer.
 *
 * Ce que la liste faisait bien, en revanche, c'était de montrer le choix sans
 * dérouler la page. Cette ligne le conserve : elle rappelle où le joker est
 * posé et ce qu'il reste possible d'en faire, sans rien piloter.
 */
function RappelJoker({ matches, regles }) {
  const pose = matches.find((m) => m.id === regles.jokerMatchId) || null;
  const engage = !!pose && new Date(pose.kickoff) <= new Date();

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      {/* Le bouffon plutôt que l'emoji, comme partout ailleurs. Vingt pixels
          ici et non vingt-six : il accompagne un intitulé de onze pixels et
          demi, et une image deux fois plus haute que son texte ne l'accompagne
          plus, elle le remplace. */}
      <p className="flex items-center gap-1.5 font-display text-[11.5px] font-bold uppercase tracking-wider text-slate-500">
        <IconeJoker taille={20} /> Mon joker de la journée
      </p>
      {/* La rencontre, présentée comme « Prochain coup d'envoi » sur l'accueil :
          deux colonnes symétriques, chaque nom contre son écusson, la date en
          dessous. Elle était écrite en texte courant, deux noms séparés d'un
          tiret — ça disait les mêmes mots mais ça ne montrait pas une affiche.

          Écussons à 20 plutôt qu'à 22 : ce bloc est un rappel à l'intérieur d'un
          récapitulatif, pas le sujet de la page. Un cran en dessous suffit à le
          dire. */}
      {pose ? (
        <FaceAFace match={pose} taille={20} className="mt-2.5" />
      ) : (
        <p className="text-[12.5px] mt-1.5 text-slate-500">pas encore posé</p>
      )}
      <p className="text-[11.5px] text-slate-500 mt-1">
        {engage
          ? 'La rencontre a commencé : il n\'est plus déplaçable.'
          : pose
          ? 'Tes points y seront doublés. Tu peux le déplacer depuis les cartes, jusqu\'au coup d\'envoi.'
          : 'Un seul joker par journée : coche-le sur la carte du match de ton choix, il double tes points.'}
      </p>
    </div>
  );
}

export default function MatchesPage() {
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Horloge : fait basculer « ouvert » en « en cours » sans rechargement
  const now = useNow(60000);

  const [drafts, setDrafts] = useState(loadDrafts);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  /**
   * L'état des règles de la journée : multiplicateurs actifs, quel match est
   * l'affiche, et où est mon joker.
   *
   * Il vient du serveur et n'est pas recalculé ici, alors que le navigateur
   * aurait tout ce qu'il faut pour le faire. C'est délibéré : la règle du
   * « match qui commence le plus tard » et son gel au premier coup d'envoi
   * existeraient alors en deux exemplaires, et deux implémentations d'une même
   * règle finissent toujours par diverger — l'écran afficherait une affiche et
   * le calcul en compterait une autre.
   */
  const [regles, setRegles] = useState(null);
  // { matchId, message } : l'erreur s'affiche sur la carte où le geste a eu
  // lieu, et non en haut de page loin du bouton qui vient d'être cliqué.
  const [jokerErreur, setJokerErreur] = useState(null);

  useEffect(() => {
    api.get('/matches/rounds').then((res) => setRounds(res.data)).catch(console.error);
    api.get('/matches/next-round').then((res) => setCurrentRound(res.data.round)).catch(console.error);
  }, []);

  // Sauvegarde automatique a chaque frappe
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {
      // stockage indisponible : les brouillons restent valables pour la session
    }
  }, [drafts]);

  /**
   * Relire les matchs — bruyamment ou en silence.
   *
   * Au chargement de la page et au changement de journée, on affiche
   * « Chargement des matchs… » : il n'y a encore rien à montrer.
   *
   * Après un geste sur une carte — poser le joker, laisser Bob remplir — on
   * relit **en silence**, sans passer par cet état. C'était la cause du retour
   * en haut de page : `loading` à vrai démontait les sept cartes le temps de la
   * requête, la page se réduisait à une ligne, et le navigateur ramenait la vue
   * tout en haut. On se retrouvait au-dessus du bandeau après avoir coché un
   * joker sur le cinquième match.
   *
   * La validation d'un pronostic, elle, évitait déjà le piège en ne relisant
   * rien du tout (voir handleSaved). Le joker et Bob, qui ont besoin de relire
   * pour connaître l'état réel côté serveur, le font maintenant sans toucher à
   * ce qui est affiché : les cartes restent en place et se mettent à jour sous
   * le pouce.
   */
  const fetchMatches = useCallback(({ silencieux = false } = {}) => {
    if (!currentRound) return;
    if (!silencieux) setLoading(true);
    api.get(`/matches?round=${currentRound}`)
      .then((res) => setMatches(res.data))
      .catch(console.error)
      .finally(() => { if (!silencieux) setLoading(false); });
  }, [currentRound]);

  const fetchRegles = useCallback(() => {
    if (!currentRound) return;
    api.get(`/predictions/round/${currentRound}/regles`)
      .then((res) => setRegles(res.data))
      // Les règles ne sont qu'un habillage : si l'appel échoue, la page reste
      // utilisable pour ce qui compte, c'est-à-dire pronostiquer.
      .catch(() => setRegles(null));
  }, [currentRound]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { fetchRegles(); }, [fetchRegles]);
  useEffect(() => { setBulkResult(null); setJokerErreur(null); }, [currentRound]);

  /**
   * Poser, déplacer ou retirer le joker.
   *
   * Le serveur expose une bascule sur un match : l'appeler sur la rencontre où
   * le joker se trouve déjà l'enlève. « Aucun » se traduit donc par une bascule
   * sur le joker en place — et ne fait rien s'il n'y en a pas.
   *
   * On relit ensuite les matchs et les règles plutôt que de deviner le nouvel
   * état : le serveur peut avoir refusé, ou avoir déplacé le joker depuis une
   * autre rencontre. Deux requêtes de plus sur un geste rare, contre un écran
   * qui ment.
   */
  const choisirJoker = useCallback(async (matchId) => {
    const cible = matchId ?? regles?.jokerMatchId ?? null;
    if (cible == null) return;

    setJokerErreur(null);
    try {
      await api.post('/predictions/joker', { matchId: cible });
      fetchMatches({ silencieux: true });
      fetchRegles();
    } catch (err) {
      setJokerErreur({
        matchId: cible,
        message: err.response?.data?.error || 'Impossible de poser le joker',
      });
      // L'écran affichait la valeur choisie alors que le serveur l'a refusée :
      // on le remet sur l'état réel.
      fetchRegles();
    }
  }, [fetchMatches, fetchRegles, regles]);

  /**
   * Le brouillon suit la frappe, y compris quand on efface.
   *
   * On avait tente de supprimer l'entree des que les deux champs etaient
   * vides, pour empecher un brouillon vide de masquer un pronostic
   * enregistre. C'etait le bon objectif mais le mauvais endroit : effacer ses
   * deux chiffres pour en saisir d'autres faisait disparaitre le brouillon, la
   * carte retombait sur le pronostic en base, et les anciens chiffres
   * revenaient sous les doigts. On ne pouvait plus modifier un prono.
   *
   * Les deux besoins ne sont pas en conflit, ils ne vivent simplement pas au
   * meme moment : pendant la saisie, un champ vide doit rester vide ; au
   * chargement de la page, un brouillon vide n'a plus aucun sens et ne doit
   * pas masquer ce qui est enregistre. La purge se fait donc dans loadDrafts,
   * et nulle part ailleurs.
   */
  const setDraft = useCallback((matchId, side, value) => {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [side]: value, t: Date.now() },
    }));
  }, []);

  /**
   * Apres une validation on remplace le pronostic du seul match concerne, et
   * on oublie son brouillon. Surtout ne pas rappeler fetchMatches ici : il
   * repasse loading a vrai, ce qui demonte toute la liste et effacerait les
   * scores saisis mais pas encore valides sur les autres matchs.
   */
  const handleSaved = useCallback((matchId, prediction) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, predictions: [prediction] } : m))
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
  }, []);

  /**
   * Le joker de la journée est-il figé ?
   *
   * Il l'est dès que la rencontre sur laquelle il est posé a commencé. C'est la
   * règle qui lui donne son poids : sans elle on le poserait sur le match de
   * 14h30, on regarderait le score, et on le déplacerait si ça tourne mal.
   *
   * Le serveur applique le même refus — c'est lui qui fait foi. Ce calcul ne
   * sert qu'à griser les boutons avant le clic, parce qu'un contrôle qui
   * accepte puis se fait refuser est pire qu'un contrôle inactif qui s'explique.
   */
  const jokerPose = matches.find((m) => m.id === regles?.jokerMatchId) || null;
  const jokerFige = !!jokerPose && new Date(jokerPose.kickoff) <= new Date(now);

  const hasPrediction = (m) => m.predictions?.length > 0;
  const isOpen = (m) => matchState(m, now) === 'avenir';
  const pending = matches.filter((m) => isOpen(m) && !hasPrediction(m));

  // Matchs ouverts dont le brouillon est complet et differe de ce qui est enregistre
  const toSave = matches.filter((m) => {
    if (!isOpen(m)) return false;
    const d = drafts[m.id];
    if (!d || d.home === '' || d.home === undefined || d.away === '' || d.away === undefined) return false;
    const p = m.predictions?.[0];
    return !p || p.homeScorePred !== d.home || p.awayScorePred !== d.away;
  });

  const saveAll = async () => {
    setBulkSaving(true);
    setBulkResult(null);
    let ok = 0;
    const failed = [];

    // En serie plutot qu'en parallele : sept requetes, et les erreurs restent lisibles
    for (const m of toSave) {
      const d = drafts[m.id];
      try {
        const res = await api.post('/predictions', {
          matchId: m.id,
          homeScorePred: d.home,
          awayScorePred: d.away,
        });
        handleSaved(m.id, res.data);
        ok++;
      } catch (err) {
        failed.push(
          `${m.homeTeam.shortName}–${m.awayTeam.shortName} : ${err.response?.data?.error || 'erreur'}`
        );
      }
    }

    setBulkSaving(false);
    setBulkResult({ ok, failed });
  };

  /*
   * Plus de marge au-dessus du bandeau — `pb-6` au lieu de `py-6`.
   *
   * Il y avait une bande de fond crème entre le liseré orange de la barre de
   * navigation et le haut de l'image. L'image touche déjà les deux bords
   * latéraux : elle se présente donc comme un bandeau pleine largeur, mais sa
   * marge haute la présentait en même temps comme une carte posée sur le fond.
   * Elle ne peut pas être les deux, et c'est cet entre-deux qui lui donnait
   * l'air de flotter.
   *
   * Collée, la page s'ouvre sur trois bandes qui s'enchaînent : le vert de la
   * barre, le liseré, l'image. La respiration arrive juste après, sous le
   * titre, là où elle sert à quelque chose.
   *
   * La marge basse reste : c'est la seule qui séparait du contenu.
   */
  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      {/* Le bandeau de la page.

          Quatrième page à en porter un, et la première à ne pas être en 16/9.

          La raison tient à ce qu'on vient y faire. Sur Bienvenue, l'Accueil ou
          le Classement, on regarde : une grande image donne le ton et ne gêne
          personne. Ici on saisit sept scores, et un bandeau de 220 pixels sur un
          téléphone repousse le premier match sous la ligne de flottaison — on
          commence par faire défiler, ce qui est une drôle de façon d'entrer dans
          une page de saisie.

          L'image étant panoramique, la garder dans ses proportions règle les
          deux problèmes à la fois : rien n'est coupé — ni le poulpe au centre,
          ni les deux tablées — et le bandeau fait la moitié de la hauteur. Le
          `ratio` est passé en propriété ; les trois autres pages n'ont rien
          changé et gardent le 16/9 par défaut.

          8/3 et non 2.667 : c'est la proportion exacte de l'image, 2048 sur 768,
          et l'écrire en fraction évite qu'un arrondi fasse apparaître un cheveu
          de fond sur l'un des bords. */}
      <Bandeau nom="mes-pronos-pub" ratio={8 / 3} className="mb-5" />

      {/* Le nom de la page, au-dessus du titre.

          Cette page était la seule à ne pas se nommer : les autres annoncent
          « Tous les pronos » ou « Classement », celle-ci annonçait la journée
          affichée. En arrivant par l'icône de la barre, rien ne disait où l'on
          était — on le déduisait du contenu.

          L'intitulé est volontairement discret et reprend `rule-label`, le même
          style que « Récapitulatif » plus bas : il nomme sans voler la vedette
          au numéro de journée, qui reste l'information qui change. */}
      <p className="rule-label mb-1.5">Mes pronos</p>

      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h1 className="font-display text-[26px] font-extrabold leading-none">
          Journée <span className="text-amber-500">{currentRound ?? '—'}</span>
        </h1>
        {pending.length > 0 && (
          <span className="font-display text-xs font-bold chip-accent px-2.5 py-1 rounded whitespace-nowrap">
            {pending.length} à faire
          </span>
        )}
      </div>
      <p className="text-xs italic text-slate-500 mb-5">Saison 2026-2027 · Championnat de France</p>

      {/* Sélecteur de journée */}
      <SelecteurJournee rounds={rounds} valeur={currentRound} onChange={setCurrentRound} className="mb-5" />

      {/* Récapitulatif */}
      {!loading && matches.length > 0 && (
        <div className="card mb-5">
          <h3 className="rule-label mb-4">Récapitulatif</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-amber-500">
                {matches.filter(hasPrediction).length}/{matches.length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Pronostics</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-green-400">
                {matches
                  .filter((m) => m.status === 'FINISHED')
                  .reduce((sum, m) => sum + (m.predictions?.[0]?.points || 0), 0)}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Points</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-blue-400">
                {/* Sur le barème (`basePoints`), jamais sur le total : un score
                    exact joué en joker vaut 6 et ne serait plus compté ici.
                    Le repli sur `points` couvre les pronostics d'avant les
                    multiplicateurs, où les deux valeurs étaient égales. */}
                {matches.filter((m) => {
                  const p = m.predictions?.[0];
                  return m.status === 'FINISHED' && p && (p.basePoints ?? p.points) === 3;
                }).length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Scores exacts</p>
            </div>
          </div>

          {/* Le joker de la journée : rappelé ici, posé dans les cartes.

              Il a d'abord été une case à cocher par match, puis cette liste
              déroulante, et il revient dans les cartes sous forme de boutons
              radio. Ce n'est pas un aller-retour pour rien : la case à cocher
              ne disait rien de l'exclusivité et il fallait l'expliquer partout,
              là où des boutons radio la portent dans leur nature.

              Ce que la liste apportait — voir son choix sans dérouler la page —
              est conservé par cette ligne, qui informe sans rien piloter. */}
          {regles?.actif && <RappelJoker matches={matches} regles={regles} />}
        </div>
      )}

      {/* Bob le poulpe, juste après le récapitulatif et avant « Tout valider ».

          L'ordre n'est pas indifférent : le récapitulatif annonce ce qu'il
          reste à faire, Bob propose de le faire, et le bloc suivant envoie ce
          qui est saisi. On lit donc la page comme une phrase, et le secours
          arrive au moment où l'on vient de constater le retard.

          Le bloc ne disparaît jamais, même quand tout est pronostiqué : Bob sert
          alors à autre chose, il donne son avis. Il reçoit pour cela trois
          nombres qu'il ne saurait pas calculer lui-même — les cases vides, les
          scores saisis mais pas encore envoyés, et la liste des matchs pour
          nommer les équipes dans son commentaire.

          `aValider` est le même compte que le bloc « Tout valider » juste en
          dessous, et ce doublon est volontaire : des scores tapés mais pas
          envoyés ne comptent pour rien, ils ne vivent que dans ce navigateur, et
          c'est la seule façon de perdre une journée sans s'en rendre compte. Le
          dire deux fois est moins grave que de ne le dire qu'en bas de page.

          Après son passage on relit tout depuis le serveur plutôt que de
          deviner — même règle que pour le joker. */}
      {!loading && currentRound && matches.length > 0 && (
        <Bob
          round={currentRound}
          regles={regles}
          matches={matches}
          aRemplir={pending.length}
          aValider={toSave.length}
          onFait={() => { fetchMatches({ silencieux: true }); fetchRegles(); }}
        />
      )}

      {/* Tout valider — placé AVANT la liste, et c'est tout l'objet du
          changement. En dessous des sept matchs, il fallait faire défiler
          toute la page pour le découvrir : autant dire que personne ne le
          voyait, et qu'on pouvait quitter la page en croyant avoir joué.

          Le bloc est désormais **toujours là** tant qu'il reste une rencontre
          ouverte, et il garde la même hauteur qu'il ait quelque chose à envoyer
          ou non.

          Il apparaissait auparavant au moment précis où l'on complétait un
          score — le second chiffre tapé faisait naître « 1 prono en attente »
          au-dessus de la liste, et toutes les cartes descendaient d'une
          centaine de pixels sous le pouce. Les ordinateurs et Android
          compensent ce genre de saut ; l'iPhone ne le fait pas, et c'est
          précisément sur un iPhone qu'on saisit ses pronos.

          Les deux états ont donc la même charpente : un titre, une phrase, le
          bouton. Le bouton est inactif quand il n'y a rien à envoyer, ce qui se
          comprend d'un regard. La phrase a deux lignes réservées sur téléphone,
          parce que la plus longue des deux s'y replie ; sur un écran large les
          deux tiennent sur une ligne et la réserve est levée.

          Le liseré passe de l'ambre au vert : c'est la seule chose qui change
          vraiment de l'un à l'autre, et elle ne coûte aucun pixel. */}
      {!loading && matches.some(isOpen) && (
        <div className={`card mb-5 border-l-4 ${toSave.length > 0 ? 'border-l-amber-500' : 'border-l-green-500/70'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className={`font-display font-bold text-[15px] ${toSave.length > 0 ? '' : 'text-green-400'}`}>
                {toSave.length > 0
                  ? `${toSave.length} prono${toSave.length > 1 ? 's' : ''} en attente`
                  : '✅ Rien en attente'}
              </p>
              <p className="text-[12px] leading-[1.5] min-h-[3em] sm:min-h-0 text-slate-500 mt-0.5">
                {toSave.length > 0
                  ? 'Saisis mais pas encore envoyés. Ils sont conservés dans ce navigateur.'
                  : 'Tout ce que tu as saisi est enregistré. Un score modifié s\'affichera ici.'}
              </p>
            </div>
            <button
              onClick={saveAll}
              disabled={bulkSaving || toSave.length === 0}
              className="btn-primary text-[13.5px] shrink-0"
            >
              {bulkSaving ? 'Envoi…' : 'Tout valider'}
            </button>
          </div>

          {/* Le compte rendu d'un envoi groupé, lui, change la hauteur — mais il
              n'apparaît qu'après un clic sur ce bouton, c'est-à-dire quand on a
              les yeux ici et pas sur une case de score plus bas. */}
          {bulkResult && (
            <div className="mt-3 pt-3 border-t border-slate-800 text-[12.5px]">
              {bulkResult.ok > 0 && (
                <p className="text-green-400">
                  {bulkResult.ok} prono{bulkResult.ok > 1 ? 's' : ''} enregistré{bulkResult.ok > 1 ? 's' : ''}
                </p>
              )}
              {bulkResult.failed.length > 0 && (
                <div className="mt-1 text-red-400">
                  <p>{bulkResult.failed.length} en échec :</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {bulkResult.failed.map((f, i) => <li key={i}>· {f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Liste des matchs */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement des matchs…</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-2">Aucun match pour la journée {currentRound}</p>
          <p className="text-slate-600 text-sm">Les matchs seront ajoutés prochainement</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              draft={drafts[match.id]}
              now={now}
              onDraftChange={setDraft}
              onPredictionSaved={handleSaved}
              regles={regles}
              onJoker={choisirJoker}
              jokerFige={jokerFige}
              jokerErreur={jokerErreur?.matchId === match.id ? jokerErreur.message : ''}
            />
          ))}
        </div>
      )}

    </div>
  );
}
