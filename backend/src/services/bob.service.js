/**
 * Bob le poulpe — le calcul d'un pronostic automatique.
 *
 * Le joueur en retard, ou qui n'a pas envie de se creuser la tête, appuie sur un
 * bouton et Bob remplit ses cases. Ce fichier ne contient que l'arithmétique :
 * aucune base de données, aucune requête, aucune date. Il prend des chiffres et
 * rend des chiffres, donc il se teste — c'est la même leçon que le barème et que
 * `cumuler` dans les statistiques : tant qu'une règle vit au milieu d'une boucle
 * qui lit la base, la seule façon de savoir ce qu'elle calcule est de jouer une
 * journée et de regarder après coup.
 *
 * ---------------------------------------------------------------------------
 * Comment Bob estime un score
 * ---------------------------------------------------------------------------
 *
 * Il ne sait rien que le site ne sache déjà. Il lit les deux chiffres que la
 * carte de match affiche sous « Moyennes par match » : ce qu'une équipe marque
 * en moyenne, et ce que l'autre encaisse en moyenne. L'estimation est la
 * moyenne des deux.
 *
 *   Toulouse marque 31 points par match, Vannes en encaisse 29
 *   → Bob attend 30 points de Toulouse.
 *
 * Prendre la moyenne des deux plutôt que l'un ou l'autre, c'est reconnaître
 * qu'un score se joue à deux : une attaque qui marque beaucoup contre une
 * défense qui encaisse peu doit atterrir entre les deux, pas à l'un des bouts.
 *
 * Puis l'avantage du terrain, six points, partagé : trois de plus pour le
 * recevant, trois de moins pour le visiteur. Six points, c'est l'ordre de
 * grandeur admis en rugby professionnel, et c'est bien ce qu'on observe sur les
 * journées déjà jouées. Les partager plutôt que les ajouter d'un seul côté
 * laisse le total du match à peu près juste — un match à domicile n'est pas un
 * match avec six points de plus au tableau, c'est un match penché.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi Bob tire aux dés
 * ---------------------------------------------------------------------------
 *
 * C'est la conséquence d'une règle que tu as posée : l'usage de Bob est privé,
 * rien ne le signale dans « Tous les pronos » ni dans les mails, et libre à
 * chacun d'en parler ou pas. Mais un calcul est un calcul : deux joueurs qui
 * appellent Bob la même journée obtiendraient exactement les mêmes sept scores,
 * à l'unité près, sur les sept matchs. Deux colonnes identiques dans le tableau,
 * et tout le monde comprend. Le secret serait percé par l'arithmétique.
 *
 * Donc Bob s'écarte de son estimation de zéro à trois points sur chaque score,
 * au hasard. Sept matchs, quatorze scores, sept valeurs possibles chacun : la
 * probabilité que deux appels se ressemblent assez pour se faire remarquer
 * devient négligeable. Et trois points sur un score de rugby, c'est une pénalité
 * — assez pour brouiller la signature, trop peu pour abîmer le pronostic.
 *
 * Le hasard entre par l'argument `hasard`, qui vaut `Math.random` en vrai et une
 * suite connue dans les tests. Sans cette porte, un calcul aléatoire ne se teste
 * pas : on ne peut écrire aucune assertion sur un résultat qui change à chaque
 * exécution.
 *
 * ---------------------------------------------------------------------------
 * Ce que Bob ne fait pas
 * ---------------------------------------------------------------------------
 *
 * Il ne touche **que les cases vides**. Un pronostic déjà saisi est une opinion,
 * et Bob n'est pas là pour la corriger — c'est l'inverse qui est prévu : les
 * scores qu'il écrit sont des pronostics ordinaires, que le joueur peut modifier
 * ensuite case par case s'il n'est pas d'accord.
 *
 * Il ne déplace pas un joker déjà posé, et il ne pose le sien que si le joueur
 * n'en a pas sur la journée. Le choix est alors tiré au sort parmi les matchs
 * éligibles, comme tu l'as demandé : Bob n'a aucune idée de ce qu'est un bon
 * match pour doubler ses points, et faire semblant d'en avoir une serait mentir
 * sur ce qu'il sait.
 *
 * Il n'écrit rien non plus sur un match commencé ni sur une journée fermée —
 * mais ce n'est pas lui qui le vérifie. Le contrôleur ne lui passe que des
 * matchs ouverts, pour la même raison qu'ailleurs : une règle, un endroit.
 */

/** La borne de `prediction.controller.js`. Deux cents, et pas 9 999. */
const SCORE_MAX = 200;

/**
 * Le score de repli, quand on ne sait rien.
 *
 * À la première journée de la saison, aucun club n'a de moyenne : Bob n'a
 * strictement rien à lire. Il faut bien qu'il écrive quelque chose, et 24 est la
 * moyenne de points par équipe et par match d'une saison de Top 14 — autrement
 * dit le pronostic le moins faux qu'on puisse faire en l'absence de toute
 * information. Avec l'avantage du terrain et le tirage, ça donne un 27-21
 * environ, qui est un score de rugby plausible.
 */
const SCORE_DEFAUT = 24;

/** L'avantage du recevant, en points, partagé entre les deux équipes. */
const AVANTAGE_DOMICILE = 6;

/** L'écart maximal, en points, entre l'estimation et le score écrit. */
const ALEA = 3;

/** Un nombre utilisable, ou `null`. Les moyennes valent `null` tant qu'un club n'a pas joué. */
const nombre = (v) => (Number.isFinite(v) ? v : null);

/**
 * Ce qu'une équipe devrait marquer face à cette adversaire.
 *
 * `attaque` est sa moyenne de points marqués, `defense` la moyenne de points
 * encaissés par l'autre. Si l'un des deux manque, on se contente de celui qui
 * reste plutôt que de renoncer : un chiffre vaut mieux que le repli. Si les deux
 * manquent, on rend `null` et l'appelant tranche.
 */
function estimer(attaque, defense) {
  const a = nombre(attaque);
  const d = nombre(defense);
  if (a === null && d === null) return null;
  if (a === null) return d;
  if (d === null) return a;
  return (a + d) / 2;
}

/**
 * Un entier entre -ALEA et +ALEA, bornes comprises.
 *
 * Sept valeurs équiprobables. `Math.floor` sur un intervalle de sept et non
 * `Math.round` : arrondir donnerait deux fois moins de chances aux deux bornes
 * qu'aux valeurs du milieu, ce qui n'est pas faux mais n'est pas ce qui est
 * écrit au-dessus.
 */
function tirage(hasard) {
  return Math.floor(hasard() * (2 * ALEA + 1)) - ALEA;
}

/** Un score présentable : entier, positif, sous la borne. */
const borner = (v) => Math.max(0, Math.min(SCORE_MAX, Math.round(v)));

/**
 * Le pronostic d'un match.
 *
 * `dom` et `ext` sont les deux lignes de forme, telles que `forme()` les rend
 * dans `team-stats.service.js` — donc avec `pointsPourParMatch` et
 * `pointsContreParMatch`, éventuellement à `null`.
 *
 * Le match nul est écarté en dernier geste. Le rugby en connaît, mais un
 * pronostic nul renonce d'avance aux points du bon vainqueur : c'est un pari
 * qu'aucun joueur ne poserait volontairement, et Bob ne doit pas y tomber par
 * accident d'arrondi. On départage dans le sens de l'estimation d'avant tirage,
 * et à égalité parfaite en faveur du recevant — qui a l'avantage du terrain.
 */
/**
 * L'estimation nue d'un match : avant tirage, en nombres à virgule.
 *
 * Séparée de `pronostiquerMatch` parce qu'elle a deux usages qui ne doivent pas
 * se confondre. Pour écrire un pronostic, on la bruite — sinon deux joueurs
 * obtiendraient la même grille. Pour donner un avis sur les pronostics de
 * quelqu'un, au contraire, il faut l'opinion franche de Bob : le comparer à une
 * valeur tirée au sort reviendrait à reprocher au joueur un écart que Bob s'est
 * infligé à lui-même.
 */
function base({ dom, ext }) {
  const brutDom = estimer(dom?.pointsPourParMatch, ext?.pointsContreParMatch);
  const brutExt = estimer(ext?.pointsPourParMatch, dom?.pointsContreParMatch);
  return {
    home: (brutDom === null ? SCORE_DEFAUT : brutDom) + AVANTAGE_DOMICILE / 2,
    away: (brutExt === null ? SCORE_DEFAUT : brutExt) - AVANTAGE_DOMICILE / 2,
  };
}

/** L'estimation de Bob, arrondie et sans hasard. C'est ce qu'il « pense » du match. */
function estimation({ dom, ext }) {
  const { home, away } = base({ dom, ext });
  return { home: borner(home), away: borner(away) };
}

function pronostiquerMatch({ dom, ext, hasard }) {
  const { home: baseDom, away: baseExt } = base({ dom, ext });

  let home = borner(baseDom + tirage(hasard));
  let away = borner(baseExt + tirage(hasard));

  if (home === away) {
    if (baseDom >= baseExt) home = borner(home + 1);
    else away = borner(away + 1);
  }

  return { homeScorePred: home, awayScorePred: away };
}

/**
 * Le joker de la journée, tiré au sort.
 *
 * `candidats` est la liste des identifiants de match sur lesquels un joker a le
 * droit de se poser — c'est l'appelant qui l'a filtrée, avec les règles de
 * `setJoker` : journée en vigueur, match ni commencé ni désigné comme affiche,
 * et pronostic enregistré. Bob y pioche, sans préférence.
 *
 * Rend `null` si la liste est vide, ce qui arrive légitimement : une journée
 * avant la mise en vigueur du joker, ou dont tous les matchs ouverts sont déjà
 * pronostiqués et dont le seul restant est l'affiche.
 */
function choisirJoker({ candidats = [], hasard }) {
  if (!candidats.length) return null;
  return candidats[Math.floor(hasard() * candidats.length)];
}

/**
 * Le pronostic d'une journée entière.
 *
 * Entrée :
 *  - `matchs` : `[{ id, homeTeamId, awayTeamId, dejaPronostique, estAffiche }]`,
 *     déjà restreinte par l'appelant aux matchs sur lesquels on peut écrire ;
 *  - `forme`  : l'objet rendu par `forme()`, indexé par identifiant d'équipe ;
 *  - `jokerDejaPose` : vrai si le joueur a déjà un joker sur la journée ;
 *  - `jokerActif` : faux avant la journée de mise en vigueur ;
 *  - `hasard` : la source d'aléa, injectable.
 *
 * Sortie : `{ pronostics, jokerMatchId }`. `pronostics` ne contient que les
 * cases que Bob a remplies — l'appelant n'a donc rien à filtrer avant d'écrire,
 * et un joueur qui rappelle Bob sur une journée complète obtient une liste vide
 * plutôt qu'un écrasement de ses scores.
 *
 * Le joker peut se poser sur un match que Bob vient de remplir comme sur un
 * match déjà pronostiqué à la main : dans les deux cas le pari existe au moment
 * où le joker arrive, ce que `setJoker` exige.
 */
function pronostiquerJournee({
  matchs = [],
  forme = {},
  jokerDejaPose = false,
  jokerActif = true,
  hasard = Math.random,
} = {}) {
  const pronostics = [];

  for (const m of matchs) {
    if (m.dejaPronostique) continue;
    const { homeScorePred, awayScorePred } = pronostiquerMatch({
      dom: forme[m.homeTeamId],
      ext: forme[m.awayTeamId],
      hasard,
    });
    pronostics.push({ matchId: m.id, homeScorePred, awayScorePred });
  }

  const jokerMatchId =
    jokerActif && !jokerDejaPose
      ? choisirJoker({
          candidats: matchs.filter((m) => !m.estAffiche).map((m) => m.id),
          hasard,
        })
      : null;

  return { pronostics, jokerMatchId };
}

/* ===========================================================================
 * L'avis de Bob
 * ===========================================================================
 *
 * Deuxième usage du même calcul : plutôt que d'écrire à la place du joueur, Bob
 * regarde ce que le joueur a écrit et dit ce qu'il en pense.
 *
 * C'est un jeu, pas un oracle. Bob ne sait rien de plus que les moyennes de
 * points, il ne connaît ni les blessures, ni la pluie, ni le fait que Toulon
 * joue toujours mal à Perpignan. Les messages sont donc écrits sur ce ton-là :
 * il donne un avis, il ne corrige pas une copie. Un joueur qui s'écarte de Bob
 * n'a pas tort — il a juste une autre idée, et c'est tout l'intérêt.
 *
 * Deux mesures, et elles ne disent pas la même chose. L'écart de points dit à
 * quelle distance on est ; le désaccord sur le vainqueur dit qu'on ne raconte
 * pas le même match. Le second l'emporte toujours : être à trente points de Bob
 * en voyant le même gagnant est un détail à côté d'avoir choisi l'autre équipe.
 *
 * Les messages vivent ici, côté serveur, et non dans le composant React. Ils ont
 * des conditions de déclenchement — des seuils, des cas prioritaires — et tout
 * ce qui a des conditions mérite un test. C'est la même raison qui a sorti le
 * barème des boucles qui lisent la base.
 */

/** Les seuils d'écart, en points cumulés sur les deux scores d'un match. */
const ECART = { proche: 5, tiede: 11, large: 19 };

/** Qui gagne, selon ce couple de scores. `null` pour un nul. */
const vainqueur = (h, a) => (h > a ? 'dom' : a > h ? 'ext' : null);

/**
 * Le mot de Bob sur un match.
 *
 * L'ordre des cas est la règle : le désaccord de vainqueur passe avant tout le
 * reste, puis l'écart décide. On rend aussi les chiffres bruts, pour que l'écran
 * puisse afficher l'estimation de Bob à côté de son commentaire — un avis sans
 * le score qui le motive ne se discute pas.
 */
function avisMatch({ dom, ext, pronostic }) {
  const bob = estimation({ dom, ext });
  const moi = { home: pronostic.homeScorePred, away: pronostic.awayScorePred };

  const ecart = Math.abs(bob.home - moi.home) + Math.abs(bob.away - moi.away);
  const vBob = vainqueur(bob.home, bob.away);
  const vMoi = vainqueur(moi.home, moi.away);
  const desaccord = vBob !== null && vMoi !== null && vBob !== vMoi;

  let ton;
  let message;
  if (desaccord) {
    ton = 'desaccord';
    message = 'Bob voit l’inverse. L’un de vous deux va avoir l’air malin.';
  } else if (vMoi === null) {
    ton = 'tiede';
    message = 'Un nul ? Bob n’y croit pas une seconde, mais il admire le courage.';
  } else if (ecart <= ECART.proche) {
    ton = 'accord';
    message = 'Bob aurait signé.';
  } else if (ecart <= ECART.tiede) {
    ton = 'proche';
    message = 'Même idée, pas tout à fait le même match.';
  } else if (ecart <= ECART.large) {
    ton = 'tiede';
    message = 'Bob hausse un tentacule.';
  } else {
    ton = 'loin';
    message = 'Bob a recraché son encre.';
  }

  return { bob, ecart, desaccord, ton, message };
}

/**
 * Le mot de la fin, sur l'ensemble de la journée.
 *
 * Trois choses peuvent le déclencher, dans cet ordre : trop de vainqueurs
 * différents, un biais systématique dans les totaux, et à défaut la distance
 * moyenne. Le biais mérite d'être relevé séparément parce qu'il dit quelque
 * chose que la moyenne des écarts cache : un joueur peut être à douze points de
 * Bob sur chaque match tout en ayant exactement raison sur qui gagne — il voit
 * simplement des matchs plus ouverts.
 */
function verdict(lignes) {
  if (!lignes.length) return null;

  const n = lignes.length;
  const contres = lignes.filter((l) => l.desaccord).length;
  const moyenne = lignes.reduce((s, l) => s + l.ecart, 0) / n;

  // Le `n >= 4` n'est pas décoratif : sur deux matchs commentés, un seul
  // désaccord atteindrait la moitié et Bob lâcherait sa pire réplique pour
  // presque rien. Une accusation de ne pas regarder le même championnat demande
  // un échantillon.
  if (n >= 4 && contres >= Math.ceil(n / 2)) {
    return `Vous n’êtes d’accord sur presque aucun vainqueur (${contres} sur ${n}). Bob se demande si vous regardez le même championnat.`;
  }
  if (contres >= 2) {
    return `${contres} vainqueurs sur ${n} vous opposent. Bob maintient sa position et te souhaite bonne chance.`;
  }

  const biais =
    lignes.reduce((s, l) => s + (l.moi.home + l.moi.away) - (l.bob.home + l.bob.away), 0) / n;

  if (biais >= 12) {
    return 'Tu vois des matchs nettement plus ouverts que Bob. Lui parierait sur la boue et les pénalités.';
  }
  if (biais <= -12) {
    return 'Tu vois des matchs plus fermés que Bob, qui attend des essais partout. Rendez-vous dimanche.';
  }
  if (moyenne <= ECART.proche) {
    return 'Vous êtes d’accord sur à peu près tout. Soit vous avez raison tous les deux, soit vous vous trompez ensemble.';
  }
  if (moyenne <= ECART.tiede) {
    return 'Accord général, deux ou trois divergences. Bob trouve ça raisonnable.';
  }
  return 'Bob ne reconnaît pas sa grille dans la tienne. Il te laisse faire, il regarde.';
}

/**
 * L'avis de Bob sur une journée.
 *
 * `pronostics` est indexé par identifiant de match. Les matchs sans pronostic
 * sont ignorés : Bob ne commente pas une case vide, il propose de la remplir.
 */
/**
 * Bob reconnaît-il sa propre écriture dans cette grille ?
 *
 * Il ne doit pas commenter des pronostics qu'il a lui-même écrits : ce serait se
 * noter soi-même, et l'avis n'aurait aucun intérêt — il dirait « d'accord »
 * partout.
 *
 * La question se règle sans rien stocker, et c'est ce qui en fait la bonne
 * solution. On aurait pu écrire quelque part « Bob a rempli cette journée pour
 * ce joueur », mais ce serait exactement la trace qu'on s'est donné du mal à ne
 * jamais créer : elle finirait dans une réponse d'API ou dans un export, et
 * l'usage de Bob cesserait d'être privé.
 *
 * On le déduit donc de la grille elle-même. Quand Bob remplit, il s'écarte de
 * son estimation de trois points au plus sur chaque score, donc de six au plus
 * sur un match. Une grille entière où aucun match ne dépasse six points d'écart,
 * et où aucun vainqueur ne diffère, est sa grille — ou une grille si proche de
 * la sienne que le commentaire serait le même.
 *
 * Deux vertus par rapport à un drapeau en base. La détection survit au
 * rechargement de la page et au changement d'appareil, puisqu'elle ne dépend de
 * rien d'autre que des scores. Et elle se dément d'elle-même : dès que le joueur
 * corrige deux ou trois matchs à sa main — ce que Bob l'invite à faire —, la
 * grille redevient la sienne et l'avis se rouvre.
 *
 * Le seuil de quatre matchs évite de conclure sur un échantillon qui ne prouve
 * rien : être d'accord avec Bob sur deux matchs n'est pas une signature, c'est
 * une coïncidence.
 */
function signatureDeBob(lignes) {
  return lignes.length >= 4 && lignes.every((l) => !l.desaccord && l.ecart <= 2 * ALEA);
}

function avisJournee({ matchs = [], forme = {}, pronostics = {} } = {}) {
  const lignes = [];

  for (const m of matchs) {
    const p = pronostics[m.id];
    if (!p) continue;
    const a = avisMatch({ dom: forme[m.homeTeamId], ext: forme[m.awayTeamId], pronostic: p });
    lignes.push({
      matchId: m.id,
      moi: { home: p.homeScorePred, away: p.awayScorePred },
      ...a,
    });
  }

  if (signatureDeBob(lignes)) {
    return {
      lignes: [],
      signature: true,
      verdict:
        'Bob reconnaît son écriture : cette grille est la sienne, à trois points près. Il ne va pas se donner une bonne note tout seul. Change deux ou trois scores à ta main et redemande-lui.',
    };
  }

  return { lignes, signature: false, verdict: verdict(lignes) };
}

module.exports = {
  pronostiquerJournee,
  pronostiquerMatch,
  choisirJoker,
  estimer,
  estimation,
  avisJournee,
  avisMatch,
  signatureDeBob,
  verdict,
  SCORE_DEFAUT,
  AVANTAGE_DOMICILE,
  ALEA,
  ECART,
};
