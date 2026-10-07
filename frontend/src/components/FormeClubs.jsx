import { useState } from 'react';

/**
 * La forme des deux clubs, sur la carte de match.
 *
 * Six lignes de moyennes par match, calculées sur les journées **précédentes** —
 * c'est le serveur qui garantit cette borne, et c'est ce qui rend le bloc honnête
 * quand on rouvre la page d'une journée passée : on y voit ce qu'on savait à ce
 * moment-là, pas le résultat qu'on a sous les yeux.
 *
 * ---------------------------------------------------------------------------
 * Dépliable, et ouvert par défaut
 * ---------------------------------------------------------------------------
 *
 * Ce bloc était le seul des trois à ne pas se replier, alors que les
 * compositions et les pronos des joueurs le font depuis le début. Rien ne
 * justifiait l'exception, et c'était le plus haut des trois : sept cartes avec
 * six lignes de chiffres chacune, ça fait quarante-deux lignes qu'on traverse
 * pour arriver au bas de la page.
 *
 * Il s'ouvre toutefois **par défaut**, contrairement aux deux autres, et la
 * différence tient à ce qu'on en fait. On déplie une composition pour vérifier
 * un point précis, une fois ; on regarde les moyennes pendant qu'on choisit le
 * score qu'on va saisir, donc sur chaque carte. Les refermer d'office
 * obligerait à les rouvrir sept fois par journée, ce qui est exactement le
 * geste qu'on cherche à éviter.
 *
 * L'état est propre à chaque carte et n'est pas conservé d'une visite à
 * l'autre. Si tu veux qu'un repli vaille pour toute la page, ou qu'il soit
 * retenu d'une fois sur l'autre, c'est une autre mécanique — dis-le et je la
 * pose.
 *
 * ---------------------------------------------------------------------------
 * Couleurs
 * ---------------------------------------------------------------------------
 *
 * Point délicat de ce projet. Dans la configuration Tailwind du site, `white`
 * est branché sur la variable `--ink` : `text-white` veut donc dire « encre du
 * thème », sombre en mode crème et clair en mode nuit. C'est exactement ce
 * qu'on veut pour une valeur en avant, et c'est ce que MatchCard utilise déjà
 * pour les scores. Les classes `slate` suivent le thème de la même façon.
 *
 * En revanche un fond de couleur fixe ne doit jamais passer par une classe de
 * palette — il prendrait la teinte du thème et redonnerait du noir sur fond
 * sombre. Il n'y en a aucun ici, donc rien à surveiller ; c'est dans les
 * compositions que la question se pose, pour le brassard de capitaine.
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

export default function FormeClubs({ match }) {
  const [ouvert, setOuvert] = useState(true);

  const h = match?.forme?.home;
  const a = match?.forme?.away;

  /**
   * Sur combien de rencontres portent ces moyennes.
   *
   * Le titre disait « 4 journées », et c'était faux. Ce nombre n'est pas une
   * quantité de journées de championnat : c'est le nombre de rencontres déjà
   * jouées par le club qui en a joué le moins des deux. À la J6, deux clubs
   * peuvent en afficher 5 et 4 si l'un a eu un match reporté — et deux cartes
   * de la même journée annonçaient alors des totaux différents, ce qui ne
   * pouvait que dérouter.
   *
   * On prend le plus petit des deux pour que la comparaison reste honnête :
   * comparer une moyenne sur cinq matchs à une moyenne sur trois reviendrait à
   * mettre en regard deux échantillons de poids différents.
   *
   * Tant qu'aucun des deux clubs n'a de rencontre enregistrée, il n'y a rien à
   * dire : en début de saison le bloc n'apparaît pas — ni le contenu, ni le
   * bouton, qui ouvrirait sur du vide.
   */
  const joues = Math.min(h?.matchs || 0, a?.matchs || 0);
  if (!joues) return null;

  return (
    <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
      {/* Même bouton que « Compositions » et « Pronos des joueurs » : même
          flèche, même rotation, même taille, même survol ambre, et aligné à
          gauche comme eux. Trois dépliants qui se ressemblent s'apprennent une
          fois pour trois — je l'avais centré pour épouser le tableau qu'il
          commande, et c'était la mauvaise règle : un dépliant appartient à la
          famille des dépliants, pas à son contenu. */}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-amber-400"
      >
        <span className={`text-[9px] text-amber-500 transition-transform ${ouvert ? 'rotate-90' : ''}`}>▶</span>
        Moyennes par match
        <span className="text-slate-600">
          · sur {joues} {joues > 1 ? 'matchs joués' : 'match joué'}
        </span>
      </button>

      {ouvert && (
        <div className="mt-1.5">
          <Duel libelle="essais marqués" gauche={h?.essaisPourParMatch} droite={a?.essaisPourParMatch} />
          <Duel libelle="essais encaissés" gauche={h?.essaisContreParMatch} droite={a?.essaisContreParMatch} petitEstMieux />
          <Duel libelle="points marqués" gauche={h?.pointsPourParMatch} droite={a?.pointsPourParMatch} />
          <Duel libelle="points encaissés" gauche={h?.pointsContreParMatch} droite={a?.pointsContreParMatch} petitEstMieux />
          <Duel libelle="pénalités concédées" gauche={h?.penalitesParMatch} droite={a?.penalitesParMatch} petitEstMieux />
          <Duel libelle="plaquages manqués" gauche={h?.plaquagesManquesParMatch} droite={a?.plaquagesManquesParMatch} petitEstMieux />
        </div>
      )}
    </div>
  );
}
