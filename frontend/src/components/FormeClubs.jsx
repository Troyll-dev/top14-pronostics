import { useState } from 'react';

/**
 * La forme des deux clubs, sur la carte de match.
 *
 * Trois rubriques, dans l'ordre où on les lit avant de poser un score : le
 * classement, les cinq derniers résultats, puis les moyennes. Tout est calculé
 * sur les journées **précédentes** — c'est le serveur qui garantit cette borne,
 * et c'est ce qui rend le bloc honnête quand on rouvre la page d'une journée
 * passée : on y voit ce qu'on savait à ce moment-là, pas le résultat qu'on a
 * sous les yeux.
 *
 * ---------------------------------------------------------------------------
 * CE QUI A CHANGÉ, ET POURQUOI
 * ---------------------------------------------------------------------------
 *
 * **Les moyennes sont séparées domicile et extérieur.** C'est le changement qui
 * compte. On a mesuré que le receveur l'emporte dans 71 % des rencontres et que
 * l'avantage du terrain vaut une dizaine de points ; or le bloc affichait des
 * moyennes de saison qui mélangeaient les deux contextes. Un club qui marque 28
 * points de moyenne peut en mettre 35 chez lui et 20 au-dehors : la moyenne
 * globale annonçait un match serré là où tout disait le contraire. On compare
 * donc ce qui se compare — les chiffres du receveur à domicile face à ceux du
 * visiteur à l'extérieur — et le total de saison reste accessible d'un clic,
 * pour qui veut vérifier.
 *
 * **Les plaquages manqués sont partis.** C'est un volume, pas un taux : une
 * équipe qui domine plaque beaucoup, donc en rate beaucoup en valeur absolue.
 * Toulouse, premier au classement, est l'équipe qui en manque le plus — un
 * chiffre qui classe le leader dernier ne mesure pas ce qu'on croit. Rapporté
 * aux plaquages tentés, ce serait une statistique ; en volume, c'est surtout un
 * indicateur de temps passé à défendre.
 *
 * **Le classement et la série arrivent.** Le premier est le repère que tout le
 * monde cherche, même s'il prédit mal — mesuré à 54 % de bons vainqueurs quand
 * le simple fait de recevoir en fait 71. La seconde dit la dynamique que les
 * moyennes cachent : trois défaites de suite ne se voyaient nulle part.
 *
 * Le rang ne s'affiche que sur une rencontre **à venir**, et c'est voulu :
 * l'instantané du classement est celui d'aujourd'hui, pas celui d'avant la
 * journée. Sur un match à pronostiquer c'est exactement ce qu'il faut ; sur une
 * journée passée, ce serait un anachronisme.
 *
 * ---------------------------------------------------------------------------
 * Couleurs
 * ---------------------------------------------------------------------------
 *
 * Dans la configuration Tailwind du site, `white` est branché sur la variable
 * `--ink` : `text-white` veut donc dire « encre du thème », sombre en mode crème
 * et clair en mode nuit. C'est ce qu'on veut pour une valeur en avant, et c'est
 * ce que MatchCard utilise déjà pour les scores. En revanche un fond de couleur
 * fixe ne doit jamais passer par une classe de palette — les pastilles de
 * résultat ci-dessous en portent, elles sont donc écrites en style direct.
 */

/** Deux nombres à comparer ; le meilleur des deux prend l'encre et le gras. */
function Duel({ libelle, gauche, droite, petitEstMieux = false }) {
  const connu =
    gauche !== null && gauche !== undefined && droite !== null && droite !== undefined;
  const gagne = !connu
    ? null
    : petitEstMieux
    ? (gauche < droite ? 'g' : droite < gauche ? 'd' : null)
    : (gauche > droite ? 'g' : droite > gauche ? 'd' : null);

  const cls = (cote) =>
    gagne === cote
      ? 'font-display font-bold text-white'
      : 'text-slate-500';

  const montre = (v) => (v === null || v === undefined ? '–' : v);

  return (
    <div className="flex items-baseline justify-between gap-2 py-px">
      <span className={`w-11 text-left text-[12.5px] tabular-nums ${cls('g')}`}>
        {montre(gauche)}
      </span>
      <span className="flex-1 text-center font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
        {libelle}
      </span>
      <span className={`w-11 text-right text-[12.5px] tabular-nums ${cls('d')}`}>
        {montre(droite)}
      </span>
    </div>
  );
}

/**
 * Une pastille de résultat.
 *
 * Fonds pleins et encre fixe : ces trois couleurs ne doivent pas basculer avec
 * le thème, sans quoi le vert deviendrait illisible sur l'un des deux. La
 * nuance de la défaite est volontairement sourde — on veut voir les victoires
 * d'un coup d'œil, pas transformer une mauvaise série en sapin de Noël.
 */
const PASTILLE_RES = {
  V: { background: '#38A169', color: '#0b1020' },
  N: { background: 'rgba(148,163,184,.35)', color: 'inherit' },
  D: { background: 'rgba(206,133,130,.30)', color: 'inherit' },
};

function Serie({ liste = [], aGauche = false }) {
  if (!liste.length) {
    return <span className="text-[11px] text-slate-600">pas encore d’historique</span>;
  }

  /*
   * Du plus ancien au plus récent, de gauche à droite.
   *
   * Le serveur rend l'inverse — le dernier match en premier, parce que c'est
   * l'ordre dans lequel il les trouve. Une série se lit comme une phrase, donc
   * on la retourne ici : la pastille la plus à droite est le dernier match
   * joué, comme sur la page Championnat.
   */
  const ordre = [...liste].reverse();

  return (
    <span className={`flex items-center gap-1 ${aGauche ? '' : 'justify-end'}`}>
      {ordre.map((r, i) => (
        <span
          key={`${r.round}-${i}`}
          title={`J${r.round} ${r.domicile ? 'à domicile' : 'à l’extérieur'} · ${r.pour}–${r.contre}`}
          style={PASTILLE_RES[r.res] || PASTILLE_RES.N}
          className="inline-flex w-[18px] h-[18px] items-center justify-center rounded-sm
                     font-display text-[10px] font-bold"
        >
          {r.res}
        </span>
      ))}
    </span>
  );
}

export default function FormeClubs({ match }) {
  /*
   * Ouvert par défaut, sur téléphone comme sur ordinateur.
   *
   * Il a été replié sur téléphone pendant une version, pour qu'une carte tienne
   * dans la hauteur de l'écran. C'était régler un problème de place en cachant
   * ce qu'on vient chercher : ces chiffres servent précisément au moment où
   * l'on écrit un score, et devoir les déplier sept fois par journée coûtait
   * plus que le défilement qu'on économisait.
   */
  const [ouvert, setOuvert] = useState(true);
  const [saison, setSaison] = useState(false);

  const h = match?.forme?.home;
  const a = match?.forme?.away;

  /**
   * Sur combien de rencontres portent ces moyennes.
   *
   * On prend le plus petit des deux pour que la comparaison reste honnête :
   * comparer une moyenne sur cinq matchs à une moyenne sur trois reviendrait à
   * mettre en regard deux échantillons de poids différents.
   *
   * Et quand les contextes sont affichés, le compte porte sur eux : à la J6, un
   * club a joué trois fois chez lui, pas six, et annoncer « sur 5 matchs » au-
   * dessus de chiffres calculés sur 3 serait un mensonge par étourderie.
   */
  const dom = h?.domicile;
  const ext = a?.exterieur;

  const joues = saison
    ? Math.min(h?.matchs || 0, a?.matchs || 0)
    : Math.min(dom?.matchs || 0, ext?.matchs || 0);

  const g = saison ? h : dom;
  const d = saison ? a : ext;

  // Rien à dire tant qu'aucune rencontre n'est enregistrée pour les deux clubs.
  const rien = !(h?.matchs || a?.matchs);
  if (rien) return null;

  const aVenir = match?.kickoff ? new Date(match.kickoff) > new Date() : false;
  const rangH = h?.classement;
  const rangA = a?.classement;

  return (
    <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
      {/* Même bouton que « Compositions » : même flèche, même rotation, même
          taille, même survol ambre. Deux dépliants qui se ressemblent
          s'apprennent une fois pour deux. */}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-amber-400"
      >
        <span className={`text-[9px] text-amber-500 transition-transform ${ouvert ? 'rotate-90' : ''}`}>▶</span>
        Avant de pronostiquer
      </button>

      {ouvert && (
        <div className="mt-2">
          {/* Le classement, s'il est connu et si la rencontre n'a pas commencé. */}
          {aVenir && (rangH || rangA) && (
            <div className="flex items-baseline justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-800/70">
              <span className="w-20 text-left text-[12.5px]">
                {rangH ? (
                  <>
                    <b className="font-display text-white">{rangH.rang}<sup>e</sup></b>
                    <span className="text-slate-500"> · {rangH.points} pts</span>
                  </>
                ) : <span className="text-slate-600">–</span>}
              </span>
              <span className="flex-1 text-center font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                classement
              </span>
              <span className="w-20 text-right text-[12.5px]">
                {rangA ? (
                  <>
                    <b className="font-display text-white">{rangA.rang}<sup>e</sup></b>
                    <span className="text-slate-500"> · {rangA.points} pts</span>
                  </>
                ) : <span className="text-slate-600">–</span>}
              </span>
            </div>
          )}

          {/* Les cinq derniers résultats. */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-1.5 border-b border-slate-800/70">
            <Serie liste={h?.serie || []} aGauche />
            <span className="flex-1 text-center font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
              5 derniers
            </span>
            <Serie liste={a?.serie || []} />
          </div>

          {/* Les moyennes. */}
          {joues > 0 ? (
            <>
              <Duel libelle="essais marqués" gauche={g?.essaisPourParMatch} droite={d?.essaisPourParMatch} />
              <Duel libelle="essais encaissés" gauche={g?.essaisContreParMatch} droite={d?.essaisContreParMatch} petitEstMieux />
              <Duel libelle="points marqués" gauche={g?.pointsPourParMatch} droite={d?.pointsPourParMatch} />
              <Duel libelle="points encaissés" gauche={g?.pointsContreParMatch} droite={d?.pointsContreParMatch} petitEstMieux />
              <Duel libelle="pénalités concédées" gauche={g?.penalitesParMatch} droite={d?.penalitesParMatch} petitEstMieux />
            </>
          ) : (
            <p className="text-[11.5px] text-slate-600 py-1">
              Pas encore de rencontre {saison ? 'enregistrée' : 'dans ce contexte'} pour les deux clubs.
            </p>
          )}

          {/* La bascule, et la phrase qui dit ce qu'on regarde.

              Elle est en bas et discrète : le réglage par défaut est le bon
              dans presque tous les cas, et un interrupteur en tête inviterait à
              se demander lequel choisir avant même d'avoir lu les chiffres. */}
          <button
            type="button"
            onClick={() => setSaison((v) => !v)}
            className="mt-1.5 text-[11px] text-slate-600 transition-colors hover:text-amber-400 text-left"
          >
            {saison
              ? `Moyennes sur toute la saison · sur ${joues} ${joues > 1 ? 'matchs' : 'match'} — voir domicile / extérieur`
              : `Moyennes à domicile pour le receveur, à l’extérieur pour le visiteur · sur ${joues} ${joues > 1 ? 'matchs' : 'match'} — voir toute la saison`}
          </button>
        </div>
      )}
    </div>
  );
}
