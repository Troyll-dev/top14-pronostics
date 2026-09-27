/**
 * La forme des deux clubs, sur la carte de match.
 *
 * Six lignes de moyennes par match, calculées sur les journées **précédentes** —
 * c'est le serveur qui garantit cette borne, et c'est ce qui rend le bloc honnête
 * quand on rouvre la page d'une journée passée : on y voit ce qu'on savait à ce
 * moment-là, pas le résultat qu'on a sous les yeux.
 *
 * Toujours visible, contrairement aux compositions. C'est l'information qu'on
 * veut avoir devant soi **pendant** qu'on saisit un score, pas après avoir
 * cliqué pour déplier.
 *
 * Sur les couleurs, et c'est le point délicat de ce projet. Dans la
 * configuration Tailwind du site, `white` est branché sur la variable `--ink` :
 * `text-white` veut donc dire « encre du thème », sombre en mode crème et clair
 * en mode nuit. C'est exactement ce qu'on veut pour une valeur en avant, et c'est
 * ce que MatchCard utilise déjà pour les scores. Les classes `slate` suivent le
 * thème de la même façon.
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
  const h = match?.forme?.home;
  const a = match?.forme?.away;

  // Tant qu'aucun des deux clubs n'a de rencontre enregistrée, il n'y a rien à
  // dire : en début de saison le bloc n'apparaît simplement pas.
  const joues = Math.min(h?.matchs || 0, a?.matchs || 0);
  if (!joues) return null;

  return (
    <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
      <p className="mb-1.5 text-center font-display text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
        Moyennes par match · {joues} {joues > 1 ? 'journées' : 'journée'}
      </p>

      <Duel libelle="essais marqués" gauche={h?.essaisPourParMatch} droite={a?.essaisPourParMatch} />
      <Duel libelle="essais encaissés" gauche={h?.essaisContreParMatch} droite={a?.essaisContreParMatch} petitEstMieux />
      <Duel libelle="points marqués" gauche={h?.pointsPourParMatch} droite={a?.pointsPourParMatch} />
      <Duel libelle="points encaissés" gauche={h?.pointsContreParMatch} droite={a?.pointsContreParMatch} petitEstMieux />
      <Duel libelle="pénalités concédées" gauche={h?.penalitesParMatch} droite={a?.penalitesParMatch} petitEstMieux />
      <Duel libelle="plaquages manqués" gauche={h?.plaquagesManquesParMatch} droite={a?.plaquagesManquesParMatch} petitEstMieux />
    </div>
  );
}
