import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import TeamCrest from './TeamCrest';

/**
 * Deux équipes qui s'opposent, et la date en dessous.
 *
 * Cette disposition a coûté trois essais sur la page d'accueil, et il n'est pas
 * question de la recopier ailleurs à la main : une deuxième copie dériverait de
 * la première au premier réglage, et plus personne ne saurait laquelle fait foi.
 * D'où ce composant, appelé par « Prochain coup d'envoi » sur l'accueil et par
 * le rappel du joker sur « Mes pronos ».
 *
 * ---------------------------------------------------------------------------
 * Ce que la forme garantit, et qui ne se devine pas en lisant le JSX
 * ---------------------------------------------------------------------------
 *
 * **Deux colonnes symétriques, le tiret au milieu.** Tout tenait au départ sur
 * une seule ligne — nom, écusson, tiret, écusson, nom — et la ligne cédait dès
 * qu'un club s'appelait Union Bordeaux-Bègles. L'autoriser à se replier n'a rien
 * arrangé : les deux noms vivant dans un même paragraphe, ils se sont empilés du
 * même côté, et l'on ne voyait plus qui recevait qui. Deux colonnes de largeur
 * égale, chacune avec son `min-w-0`, est la seule forme qui dise d'elle-même que
 * ce sont deux équipes qui s'affrontent — et qui tienne quelle que soit la
 * longueur des noms.
 *
 * **Chaque nom contre son écusson, vers le centre.** Celui du recevant est
 * aligné à droite et son écusson le suit ; celui du visiteur est aligné à gauche
 * et son écusson le précède. La symétrie n'est pas décorative : c'est elle qui
 * fait qu'on lit un affrontement et non une liste de deux clubs.
 *
 * **`break-words`, jamais `truncate`.** Un nom coupé — « Montpel… » — ne désigne
 * plus personne, alors qu'un nom sur deux lignes se lit encore. Et `break-words`
 * plutôt qu'`overflow-wrap: anywhere`, qui autorise le moteur à casser au milieu
 * d'un mot et produisait des « Montp / ellier ». C'est la même règle que sur la
 * carte de match, et elle vaut pour tout le site.
 *
 * **La date descend d'une ligne**, centrée, parce qu'elle n'a pas besoin d'être
 * lue en même temps que l'affiche. `avecDate` permet de s'en passer là où la
 * date est déjà dite ailleurs.
 *
 * ---------------------------------------------------------------------------
 * Réglages
 * ---------------------------------------------------------------------------
 *
 * `taille` est celle de l'écusson, et les noms suivent — un écusson de 22 avec
 * des noms de 13,5 pixels sur l'accueil. Le rapport entre les deux a été réglé
 * à l'œil dans un navigateur ; si tu changes l'un, regarde l'autre.
 */
export default function FaceAFace({ match, taille = 22, avecDate = true, className = '' }) {
  if (!match?.homeTeam || !match?.awayTeam) return null;

  const corps = taille >= 22 ? 'text-[13.5px] sm:text-[14.5px]' : 'text-[12.5px] sm:text-[13.5px]';

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          <span className={`break-words text-right font-display font-bold leading-tight ${corps}`}>
            {match.homeTeam.name}
          </span>
          <TeamCrest team={match.homeTeam} size={taille} />
        </div>

        <span className="shrink-0 text-slate-500 text-[13px]">—</span>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamCrest team={match.awayTeam} size={taille} />
          <span className={`break-words font-display font-bold leading-tight ${corps}`}>
            {match.awayTeam.name}
          </span>
        </div>
      </div>

      {avecDate && match.kickoff && (
        <p className="mt-1.5 text-center text-[12px] italic text-slate-500 first-letter:uppercase">
          {format(new Date(match.kickoff), "EEEE d MMMM · HH'h'mm", { locale: fr })}
        </p>
      )}
    </div>
  );
}
