import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Avatar from './Avatar';

const UNREAD_MS = 20000;

/**
 * Hauteur de la rangée d'onglets du bas, hors zone de sécurité.
 *
 * Elle est écrite ici et nulle part ailleurs, parce que deux endroits en
 * dépendent : la barre elle-même, et le vide qu'il faut réserver sous le
 * contenu des pages pour que le dernier élément ne se retrouve pas dessous.
 * `App.jsx` l'importe pour poser ce vide. Si l'un des deux était recopié à la
 * main, le jour où la hauteur change, le dernier match de la liste passerait
 * sous la barre sans que personne ne comprenne pourquoi.
 */
export const HAUTEUR_BARRE_BAS = 58;

/**
 * Le vide à réserver sous le contenu : la barre, la zone de sécurité du
 * téléphone, et huit pixels d'air pour que le contenu ne vienne pas coller au
 * filet.
 */
export const RESERVE_BARRE_BAS =
  `calc(${HAUTEUR_BARRE_BAS}px + env(safe-area-inset-bottom, 0px) + 8px)`;

/**
 * Une icone de la barre.
 *
 * Les emojis ont tenu jusqu'ici faute de mieux, avec deux defauts : ils ne sont
 * pas dessines par le site mais par le systeme — donc pas le meme dessin sur un
 * iPhone, sur Android et sur Windows —, et sept emojis sans rapport entre eux ne
 * forment pas une famille.
 *
 * Une premiere serie d'icones 3D a ete essayee et ecartee : elles etaient vert
 * fonce et or sur une barre vert foncé, donc la moitie d'entre elles s'y
 * fondaient. Celles-ci sont dominees par l'or et la creme, et c'est toute la
 * difference — le contraste existe sans qu'on ait a leur poser une pastille
 * claire dessous.
 *
 * Vingt-quatre pixels, mesures : en dessous, la maison et les supporters
 * deviennent des taches. `srcSet` donne la version 96 aux ecrans a forte
 * densite, qui en demandent 72 pour un affichage a 24.
 *
 * `alt=""` : le libelle est a cote sur grand ecran, et le `title` de l'onglet le
 * porte sur telephone. Faire lire deux fois la meme chose n'aide personne.
 */
function IconeNav({ nom, taille = 24, style, className = '' }) {
  return (
    <img
      src={`/nav/${nom}-48.webp`}
      srcSet={`/nav/${nom}-48.webp 48w, /nav/${nom}-96.webp 96w`}
      sizes={`${taille}px`}
      alt=""
      width={taille}
      height={taille}
      decoding="async"
      className={`shrink-0 select-none ${className}`}
      style={{ width: taille, height: taille, ...style }}
    />
  );
}

/** La pastille rouge des messages non lus. */
function Pastille({ n, className = '' }) {
  return (
    <span
      className={`absolute min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white
                  font-display text-[10px] font-bold leading-[17px] text-center
                  tabular-nums ${className}`}
    >
      {n > 99 ? '99' : n}
    </span>
  );
}

export default function Navbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'creme'
  );

  const [unread, setUnread] = useState(0);

  const toggleTheme = () => {
    const next = theme === 'nuit' ? 'creme' : 'nuit';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('t14-theme', next);
    } catch {
      /* navigation privée : on garde juste le thème pour la session */
    }
    setTheme(next);
  };

  /**
   * Les messages non lus, tous fils confondus.
   *
   * Le compte vient du serveur, qui garde la date de derniere lecture de chaque
   * joueur pour chaque fil — le Comptoir et chaque conversation privee. Il
   * vivait avant dans le navigateur, et ca se voyait : on lisait sur son
   * telephone, le PC gardait sa pastille. Avec un seul salon c'etait
   * supportable ; avec huit fils, ce serait huit pastilles fausses.
   *
   * Ce qui disparait au passage : le repere pose a « maintenant » a la premiere
   * ouverture, qui evitait d'accueillir un nouvel arrivant avec une pastille a
   * trois chiffres. Le serveur n'en a pas besoin — sans ligne de lecture, il
   * compte les messages recus, et un nouveau n'en a aucun.
   */
  const refreshUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/messages/unread');
      setUnread(res.data.count || 0);
    } catch {
      /* salon indisponible : la barre reste utilisable, sans pastille */
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const id = setInterval(() => { if (!document.hidden) refreshUnread(); }, UNREAD_MS);

    /*
     * L'evenement ne dit plus « tout est lu » mais « quelque chose a change,
     * recompte ». C'est la nuance qu'imposent les fils : ouvrir une
     * conversation n'efface pas la pastille s'il reste du nouveau ailleurs, et
     * mettre zero ici afficherait un total faux jusqu'au tour suivant.
     */
    const onRead = () => refreshUnread();
    window.addEventListener('t14-chat-lu', onRead);

    return () => { clearInterval(id); window.removeEventListener('t14-chat-lu', onRead); };
  }, [user, refreshUnread]);

  // Entrer dans le salon ne vide plus la pastille : on n'y lit qu'un fil a la
  // fois, et c'est la page qui annonce chaque lecture. On recompte simplement
  // en arrivant, pour ne pas attendre le prochain tour.
  useEffect(() => { if (pathname === '/chat') refreshUnread(); }, [pathname, refreshUnread]);

  /**
   * L'ordre des onglets.
   *
   * Il suit le fil d'une journée de championnat plutôt qu'un classement par
   * importance. On arrive sur l'accueil, on va voir qui joue qui et dans quel
   * état sont les clubs — le championnat —, on pose ses pronostics, on regarde
   * ceux des autres, et c'est seulement après les matchs qu'on va au classement
   * voir ce que tout cela a donné. Le Comptoir ferme la marche parce qu'on y
   * passe quand on a fini.
   *
   * Le classement était en deuxième position dans une version précédente, au
   * motif qu'on le consulte souvent sans rien y faire. C'était un autre
   * raisonnement, pas un meilleur : celui-ci a l'avantage de se deviner, donc
   * de ne pas avoir à être appris.
   *
   * « Comptoir » remplace « Vestiaire ». L'adresse reste `/chat` : la changer
   * casserait les liens déjà envoyés par courriel sans rien apporter — une
   * adresse n'est pas un libellé, personne ne la lit.
   *
   * **Une seule liste pour les deux barres.** C'est tout l'intérêt de n'avoir
   * qu'un composant : la barre du haut et celle du bas parcourent le même
   * tableau. Un onglet ajouté dans six mois apparaîtra des deux côtés sans
   * qu'on ait à y penser — alors que deux composants séparés auraient dérivé
   * l'un de l'autre au premier ajout, et c'est toujours celui qu'on ne teste
   * pas, le téléphone, qui serait resté en arrière.
   *
   * L'administration n'est plus dans cette liste, ni ailleurs dans ce fichier.
   * Elle est passée dans la page Profil, et pour deux raisons.
   *
   * La première est qu'elle ne concerne qu'une personne : elle ne méritait pas
   * un septième des onglets du téléphone, et elle occupait dans la barre du
   * haut une place que rien d'autre ne vient réclamer.
   *
   * La seconde est un vrai défaut, découvert en déplaçant la première : cet
   * engrenage était affiché à tout le monde. Le serveur dit pourtant depuis
   * toujours qui est administrateur — `user.admin`, calculé à chaque connexion
   * — et la page `/admin` est bien gardée de son côté. Mais la barre, elle, ne
   * posait jamais la question : les sept autres joueurs voyaient donc un onglet
   * qui ne leur aurait répondu que par un refus. Le test manquant est désormais
   * dans la page Profil, qui n'affiche le bloc qu'aux administrateurs.
   */
  const pages = [
    { to: '/', icone: 'accueil', label: 'Accueil' },
    { to: '/top14', icone: 'championnat', label: 'Championnat' },
    { to: '/pronostics', icone: 'mes-pronos', label: 'Mes pronos' },
    { to: '/pronos', icone: 'tous-les-pronos', label: 'Résultats' },
    { to: '/classement', icone: 'classement', label: 'Classement' },
    { to: '/chat', icone: 'comptoir', label: 'Comptoir', badge: unread },
  ];


  return (
    <>
      {/* =====================================================================
          LA BARRE DU HAUT

          Sur ordinateur et sur tablette, elle porte tout : l'enseigne, les
          six onglets, le theme et le profil. La deconnexion y figurait aussi ;
          elle est descendue dans la page Profil, voir plus bas.

          Sur telephone, elle perd ses onglets : ils sont descendus en bas. Il
          lui reste l'enseigne et les commandes de droite, qui n'ont rien a
          faire dans une barre d'onglets — le theme n'est pas une page, et le
          ranger parmi les pages aurait fait une cible de plus la ou six
          tiennent deja juste.

          Ce qui se gagne au passage : l'enseigne redevient visible sur
          telephone. Elle avait ete masquee en dessous de `lg` parce que ses
          trente pixels etaient pris sur la bande d'onglets defilante, qui s'en
          trouvait rognee aux deux bouts. La bande n'est plus la ; la place est
          libre ; le site a de nouveau un nom sur l'ecran ou on le regarde le
          plus souvent.
          ===================================================================== */}
      <nav className="nav-band sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 flex items-center justify-between h-14 gap-1 sm:gap-2">
          {/* L'enseigne ne mene nulle part : c'est l'onglet « Accueil » qui fait
              ce travail, il est nomme et il s'allume. Un `span` et non un
              `Link` desactive — un lien qu'on neutralise reste focalisable au
              clavier et garde son curseur de main, donc il promet encore
              quelque chose. */}
          {/* L'enseigne ramene a l'accueil.

              Elle ne l'a pas toujours fait, et les deux decisions etaient
              bonnes a leur moment — ce qui merite d'etre consigne, sinon
              quelqu'un refera le chemin dans un sens ou dans l'autre.

              Elle etait un `span` tant que les onglets vivaient dans cette
              barre : « Accueil » etait son voisin immediat, nomme et allume
              quand on y est. Deux chemins cote a cote vers la meme page, dont
              un muet, c'etait un de trop — et un titre cliquable sans rien qui
              l'indique est une promesse qu'on ne tient qu'a moitie.

              Les onglets sont descendus en bas sur telephone : l'enseigne est
              desormais seule dans son coin, et ce coin-la est l'endroit ou tout
              le monde clique pour revenir au debut. La convention est si
              repandue qu'elle n'a pas besoin d'etre apprise, et elle met le
              retour a l'accueil a portee du pouce sans rien coûter a la barre
              du bas.

              Sur grand ecran l'onglet « Accueil » reste a cote, donc la
              redondance revient — mais elle ne gene plus : c'est la meme
              redondance que sur tous les sites, et personne ne s'en est jamais
              plaint.

              `hover:opacity-80` plutot qu'un fond au survol : l'enseigne n'est
              pas un onglet et ne doit pas se mettre a leur ressembler.

              `whitespace-nowrap` : a exactement 1024 pixels de large — le seuil
              `lg` lui-meme —, les sept onglets avec leurs libelles remplissent
              la barre au pixel pres, et « Top 14 Pronos » se repliait alors sur
              deux lignes, ce qui etirait la barre. Personne n'a un ecran de
              1024 pile, mais une fenetre redimensionnee y passe. */}
          <Link
            to="/"
            title="Retour à l'accueil"
            className="nav-tx font-display font-bold text-base tracking-wide flex items-center gap-2 shrink-0 select-none whitespace-nowrap rounded-md hover:opacity-80 transition-opacity"
          >
            <IconeNav nom="logo" taille={24} />
            <span>Top 14 Pronos</span>
          </Link>

          {/* Les onglets, a partir de `lg` seulement.
              Plus de `overflow-x-auto` ni de `min-w-0` : la bande defilante
              n'existait que pour le telephone, qui a maintenant sa propre
              barre. Au-dessus de `lg` tout tient, et tout tenait deja. */}
          <div className="hidden lg:flex items-center gap-0.5">
            {pages.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                title={l.label}
                className={`relative shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  pathname === l.to
                    ? 'tab-on font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]'
                    : 'nav-dim hover:bg-white/10'
                }`}
              >
                <IconeNav nom={l.icone} taille={24} />
                <span>{l.label}</span>

                {l.badge > 0 && pathname !== l.to && (
                  <Pastille n={l.badge} className="-top-0.5 -right-0.5" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* L'engrenage de l'administration etait ici, affiche a tout le
                monde et menant a une page refusee a sept joueurs sur huit. Il
                est dans la page Profil, sous condition d'etre administrateur. */}

            {/* Le bouton de theme montre la destination, pas l'etat courant :
                en theme nuit il affiche le soleil, parce qu'un bouton promet
                ce qu'il va faire. C'etait deja le cas avec les emojis, et c'est
                la seule convention qui ne se discute pas — un interrupteur
                marque « allumer » quand la lumiere est eteinte.

                Les emojis ☀️ et 🌙 cedent la place a deux dessins du site. Un
                emoji n'est pas dessine par la page mais par le systeme : il
                n'avait donc pas le meme trait sur un iPhone, sur Android et sur
                Windows, et surtout pas celui du reste de la barre. */}
            <button
              onClick={toggleTheme}
              title={theme === 'nuit' ? 'Passer en clair' : 'Passer en sombre'}
              className="hover:bg-white/10 rounded-md px-1 py-1 transition-colors"
            >
              <IconeNav nom={theme === 'nuit' ? 'soleil' : 'lune'} taille={22} />
            </button>

            {/* La pastille mène au profil : c'est l'endroit où on la cherche. */}
            <Link
              to="/profil"
              title="Mon profil"
              className="flex items-center gap-2 rounded-md px-0.5 sm:px-1 py-1 hover:bg-white/10 transition-colors shrink-0"
            >
              <Avatar user={user} size={32} />
              <span className="nav-tx text-sm hidden lg:block">{user?.username}</span>
            </Link>

            {/* La deconnexion n'est plus ici.

                Elle a longtemps occupe cette place, d'abord en fleche « ↪ »,
                puis en porte dessinee. Elle est partie dans la page Profil, en
                bas, apres les reglages.

                Ce qui l'a chassee : elle etait collee a la pastille du profil,
                a quelques pixels d'un lien qu'on vise plusieurs fois par
                semaine, pour une action qu'on fait trois fois par an et qui
                oblige a tout retaper ensuite. Sur telephone, ou les deux
                boutons se touchent presque, le rapport entre la frequence
                d'usage et le prix de l'erreur etait indefendable.

                Ce qu'on y perd, et qu'il faut assumer : deux clics au lieu
                d'un. C'est exactement le but. */}
          </div>
        </div>
      </nav>

      {/* =====================================================================
          LA BARRE DU BAS — TELEPHONE UNIQUEMENT

          Pourquoi en bas, et pourquoi seulement la : un telephone se tient a
          une main, et le pouce atteint le bas de l'ecran sans que la main
          bouge. Le haut, lui, demande de rattraper l'appareil. Sur un ecran de
          1400 pixels le raisonnement s'inverse — six onglets etales tout en bas
          seraient a un metre de la souris —, donc la barre du bas s'arrete a
          `lg` et la barre du haut reprend son travail.

          Ce qu'elle resout, et qui a occupe toute une journee : sept onglets
          ne tenaient pas dans 375 pixels. On les a fait defiler, on a masque
          les libelles, on a retire l'enseigne, on a renomme « Tous les pronos »
          en « Resultats » pour gagner de la place. Chacune de ces decisions
          etait juste, et toutes contournaient le meme probleme — une rangee
          horizontale partagee avec le titre et trois commandes. Ici chaque
          onglet recoit son icone ET son libelle, ce qu'aucun arrangement du
          haut ne permettait, et il reste de la place.

          `fixed` et non `sticky` : elle ne suit pas le contenu, elle reste. Le
          vide necessaire sous les pages est pose par `App.jsx`, qui importe
          `RESERVE_BARRE_BAS` — sans lui, le dernier match de chaque liste
          passerait dessous et deviendrait incochable.

          `env(safe-area-inset-bottom)` : sur les iPhone sans bouton, la barre
          de gestes du systeme occupe le bas de l'ecran. Sans cette reserve, la
          rangee d'onglets passe dessous et les six deviennent difficiles a
          viser — c'est le pendant exact du `padding-top` de `.nav-band`, qui
          avait sauve la barre du haut sur les telephones a encoche.

          Le degrade est celui du haut, retourne (`0deg`), pour que le bord
          clair regarde le contenu dans les deux cas. Les couleurs viennent des
          memes variables, donc les deux themes suivent sans rien de plus.
          ===================================================================== */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch"
        style={{
          background: 'linear-gradient(0deg, rgb(var(--band-a)), rgb(var(--band-b)))',
          borderTop: '3px solid rgb(var(--a-500))',
          boxShadow: '0 -3px 16px rgb(0 0 0 / .28)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {pages.map((l) => {
          const actif = pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              aria-current={actif ? 'page' : undefined}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px]
                          transition-colors ${actif ? 'nav-tx' : 'nav-dim'}`}
              style={{ height: HAUTEUR_BARRE_BAS }}
            >
              {/* Le trait de l'onglet actif.
                  Plutot qu'un aplat clair comme en haut : six aplats cote a
                  cote sur une barre de 375 pixels donnent une mosaique, et
                  l'onglet actif ne ressort plus de ses voisins. Un trait au
                  bord du filet se lit d'un coup d'oeil et ne mange rien. */}
              {actif && (
                <span
                  className="absolute top-0 left-[14%] right-[14%] h-[2px] rounded-b-sm"
                  style={{ background: 'rgb(244 166 142)' }}
                />
              )}

              <span className="relative shrink-0">
                <IconeNav nom={l.icone} taille={26} style={{ opacity: actif ? 1 : 0.78 }} />
                {l.badge > 0 && !actif && (
                  <Pastille n={l.badge} className="-top-1.5 -right-2.5" />
                )}
              </span>

              {/* Le libelle, en taille fluide.
                  Mesure dans un navigateur : a 10 pixels fixes, « Championnat »
                  se fait couper en « Champion… » des 375 pixels de large. La
                  taille fluide regle ca parce que la largeur d'un onglet et la
                  taille du texte grandissent avec la meme unite — le rapport
                  entre les deux ne depend donc pas du telephone. Le plancher a
                  9 pixels protege les tres petits ecrans d'un texte illisible ;
                  sur un iPhone SE de premiere generation « Championnat » y
                  perdra sa fin, ce qui est le bon compromis : le mot reste
                  reconnaissable, et l'icone est juste au-dessus.
                  `text-ellipsis` plutot qu'un repli sur deux lignes : une barre
                  d'onglets dont un seul libelle fait deux lignes se deforme
                  entierement. */}
              <span
                className="block max-w-full px-0.5 text-center leading-none whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ fontSize: 'clamp(9px, 2.45vw, 11px)' }}
              >
                {l.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
