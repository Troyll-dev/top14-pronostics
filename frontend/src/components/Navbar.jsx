import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Avatar from './Avatar';

const SEEN_KEY = 't14-chat-vu';
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
  const { user, logout } = useAuth();
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
   * Messages non lus depuis la derniere visite du salon.
   *
   * Le repere est garde dans le navigateur ; a la premiere ouverture on le
   * pose a maintenant, pour ne pas accueillir un nouvel arrivant avec une
   * pastille a trois chiffres.
   */
  const refreshUnread = useCallback(async () => {
    if (!user) return;
    let since;
    try {
      since = localStorage.getItem(SEEN_KEY);
      if (!since) {
        since = new Date().toISOString();
        localStorage.setItem(SEEN_KEY, since);
      }
    } catch {
      since = new Date().toISOString();
    }

    try {
      const res = await api.get(`/messages/unread?since=${encodeURIComponent(since)}`);
      setUnread(res.data.count || 0);
    } catch {
      /* salon indisponible : la barre reste utilisable, sans pastille */
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const id = setInterval(() => { if (!document.hidden) refreshUnread(); }, UNREAD_MS);

    const onRead = () => setUnread(0);
    window.addEventListener('t14-chat-lu', onRead);

    return () => { clearInterval(id); window.removeEventListener('t14-chat-lu', onRead); };
  }, [user, refreshUnread]);

  useEffect(() => { if (pathname === '/chat') setUnread(0); }, [pathname]);

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
   * L'administration est à part, en bas de ce fichier : elle ne concerne qu'une
   * personne, et elle ne mérite donc pas un septième des onglets du téléphone.
   */
  const pages = [
    { to: '/', icone: 'accueil', label: 'Accueil' },
    { to: '/top14', icone: 'championnat', label: 'Championnat' },
    { to: '/pronostics', icone: 'mes-pronos', label: 'Mes pronos' },
    { to: '/pronos', icone: 'tous-les-pronos', label: 'Résultats' },
    { to: '/classement', icone: 'classement', label: 'Classement' },
    { to: '/chat', icone: 'comptoir', label: 'Comptoir', badge: unread },
  ];

  const admin = { to: '/admin', icone: 'admin', label: 'Admin' };
  const onglets = [...pages, admin];

  return (
    <>
      {/* =====================================================================
          LA BARRE DU HAUT

          Sur ordinateur et sur tablette, elle porte tout : l'enseigne, les
          sept onglets, le theme, le profil et la deconnexion. C'est la barre
          que le site a toujours eue, et elle ne change pas — a partir de `lg`,
          ce fichier se comporte exactement comme avant.

          Sur telephone, elle perd ses onglets : ils sont descendus en bas. Il
          lui reste l'enseigne et les trois commandes de droite, qui n'ont rien
          a faire dans une barre d'onglets — le theme et la deconnexion ne sont
          pas des pages, et les ranger parmi les pages aurait fait neuf cibles
          la ou six tiennent deja juste.

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
            {onglets.map((l) => (
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
            {/* L'administration sur telephone.
                Elle n'est pas dans la barre du bas : six onglets y tiennent,
                sept les rendraient tous plus etroits que le pouce qui les
                vise, et le septieme ne sert qu'a une personne. Un engrenage
                dans la barre du haut lui va bien — c'est la que les reglages
                se cherchent, et c'est la qu'elle ne gene personne. */}
            <Link
              to={admin.to}
              title={admin.label}
              className={`lg:hidden rounded-md px-1 py-1 transition-colors ${
                pathname === admin.to ? 'tab-on' : 'hover:bg-white/10'
              }`}
            >
              <IconeNav nom={admin.icone} taille={22} />
            </Link>

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

            {/* La deconnexion.

                C'etait une fleche « ↪ » dessinee par la police du systeme, donc
                differente sur chaque appareil et etrangere au trait du reste de
                la barre. C'est maintenant une porte avec une fleche rouge, du
                meme atelier que les onglets.

                Ce qu'on perd en chemin, et qu'il faut avoir en tete : l'ancienne
                fleche passait au rouge au survol, ce qui prevenait avant le clic.
                Une image ne change pas de couleur ; le rouge est donc permanent.
                La compensation est le `title`, et le fait que la porte ouverte
                dise d'elle-meme ce qu'elle fait — ce que « ↪ » ne faisait pas.

                Vingt-deux pixels comme l'engrenage et le theme, ses voisins. */}
            <button
              onClick={logout}
              title="Se déconnecter"
              className="group hover:bg-white/10 rounded-md px-1 py-1 shrink-0 transition-colors"
            >
              {/* Le virage au rouge, par filtre colorimetrique.

                  L'ancienne fleche « ↪ » passait au rouge au survol, ce qui
                  prevenait avant le clic qu'on allait sortir. Une image ne
                  change pas de couleur ; un filtre, si.

                  `saturate` et `hue-rotate` poussent la brique de la fleche
                  vers un rouge franc. Ce qu'il faut savoir, parce que ca ne se
                  devine pas en lisant la ligne : un filtre s'applique a toute
                  l'image, donc le bois et l'or s'orangent aussi. Mesure a 22
                  pixels, l'effet se lit comme « l'icone s'allume », ce qui est
                  le message voulu — mais ce n'est pas un recolorage de la seule
                  fleche, et il ne faut pas le pousser plus loin sous peine de
                  virer au fluorescent.

                  `group` sur le bouton et `group-hover` sur l'image : c'est le
                  bouton qu'on survole, l'image n'est qu'une partie de sa
                  surface. */}
              <IconeNav
                nom="deconnexion"
                taille={22}
                className="transition duration-150 group-hover:saturate-200 group-hover:-hue-rotate-15 group-hover:brightness-110"
              />
            </button>
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
