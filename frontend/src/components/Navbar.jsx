import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Avatar from './Avatar';

const SEEN_KEY = 't14-chat-vu';
const UNREAD_MS = 20000;

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
function IconeNav({ nom, taille = 24 }) {
  return (
    <img
      src={`/nav/${nom}-48.webp`}
      srcSet={`/nav/${nom}-48.webp 48w, /nav/${nom}-96.webp 96w`}
      sizes={`${taille}px`}
      alt=""
      width={taille}
      height={taille}
      decoding="async"
      className="shrink-0 select-none"
      style={{ width: taille, height: taille }}
    />
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
   * passe quand on a fini, et l'administration en dernier parce qu'elle ne
   * concerne qu'une personne.
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
   * Le titre « Top 14 Pronos » a disparu de la barre. Il n'etait deja plus un
   * lien — l'onglet « Accueil » fait ce travail —, donc il ne servait plus qu'a
   * decorer, et il decorait au prix d'une centaine de pixels sur la seule ligne
   * de l'ecran ou la place manque vraiment : avec lui, « Admin » se faisait
   * rogner. Le ballon reste, comme enseigne.
   */
  const links = [
    { to: '/', icone: 'accueil', label: 'Accueil' },
    { to: '/top14', icone: 'championnat', label: 'Championnat' },
    { to: '/pronostics', icone: 'mes-pronos', label: 'Mes pronos' },
    { to: '/pronos', icone: 'tous-les-pronos', label: 'Résultats' },
    { to: '/classement', icone: 'classement', label: 'Classement' },
    { to: '/chat', icone: 'comptoir', label: 'Comptoir', badge: unread },
    { to: '/admin', icone: 'admin', label: 'Admin' },
  ];


  return (
    <nav className="nav-band sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 flex items-center justify-between h-14 gap-1 sm:gap-2">
        {/* L'enseigne : le ballon et le nom du site.

            Elle a ete retiree, puis remise, et les deux decisions etaient bonnes
            au moment ou elles ont ete prises — ce qui merite d'etre consigne,
            sinon quelqu'un refera le chemin dans un sens ou dans l'autre.

            Retiree parce qu'elle coutait une centaine de pixels sur la seule
            ligne de l'ecran ou la place manque : avec elle, « Admin » se faisait
            rogner. Et parce que son ballon etait identique a l'icone de l'onglet
            « Championnat », ce qui donnait, sur telephone ou les libelles sont
            masques, deux ballons voisins dont un seul cliquable.

            Remise parce que les deux raisons ont disparu. « Tous les pronos »
            est devenu « Resultats », ce qui a rendu la place manquante ; et
            l'onglet Championnat est devenu un bouclier, donc le ballon ne
            designe plus que le site.

            Elle ne mene nulle part : c'est l'onglet « Accueil » qui fait ce
            travail, il est nomme et il s'allume. Un `span` et non un `Link`
            desactive — un lien qu'on neutralise reste focalisable au clavier et
            garde son curseur de main, donc il promet encore quelque chose.

            **Un seul seuil pour les deux.** Le ballon et le titre
            apparaissent ensemble a partir de `lg`, en meme temps que les
            libelles des onglets, et disparaissent ensemble en dessous. Un
            ballon seul, sans le nom qu'il accompagne, ne dit rien de plus que
            la page elle-meme.

            Ce qui l'impose, c'est le telephone : la bande d'onglets y defile,
            et les trente pixels du ballon lui etaient pris — les deux
            extremites de la bande, l'accueil et l'engrenage, se retrouvaient
            rognees par le bord. Une image decorative ne prend pas la place
            d'une commande, surtout sur l'ecran ou la place est la plus chere.

            Il y a eu un reglage intermediaire, le ballon des `md` et le titre
            des `lg`, pour que l'iPad garde une enseigne. Deux seuils pour une
            seule chose, c'est une regle de plus a retenir pour pas grand-chose :
            abandonne. */}
        <span className="nav-tx font-display font-bold text-base tracking-wide hidden lg:flex items-center gap-2 shrink-0 select-none">
          <IconeNav nom="logo" taille={24} />
          <span>Top 14 Pronos</span>
        </span>

        {/* Bande d'onglets defilante.

            Sept onglets plus le theme, l'avatar et la deconnexion ne tiennent
            pas dans 375 px : la barre debordait et, comme elle est `sticky`,
            c'est toute la page qui se decalait — il fallait la tirer a la main
            pour atteindre la deconnexion.

            `min-w-0` autorise cette bande a se retrecir : sans lui, une boite
            flex refuse de descendre sous la largeur de son contenu et pousse
            le reste dehors. `overflow-x-auto` la fait alors defiler seule, et
            le defilement etant interne, la deconnexion reste en dehors, donc
            toujours visible. La barre du defileur est masquee : on fait
            glisser au doigt.

            L'interieur est en `w-max mx-auto` : centre quand tout tient,
            defilable depuis le debut quand ca deborde.

            A partir de `lg` les libelles apparaissent et la barre retrouve
            exactement son comportement d'origine : pas de retrecissement, pas
            de defilement interne. C'est deliberé — sur grand ecran tout
            s'affiche deja, et une bande defilante y cacherait des onglets qui
            etaient visibles. */}
        <div className="flex-1 min-w-0 overflow-x-auto lg:flex-none lg:min-w-fit lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-0.5 w-max mx-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              className={`relative shrink-0 flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                pathname === l.to
                  ? 'tab-on font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]'
                  : 'nav-dim hover:bg-white/10'
              }`}
            >
              <IconeNav nom={l.icone} taille={24} />
              <span className="hidden lg:inline">{l.label}</span>

              {l.badge > 0 && pathname !== l.to && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full
                                 bg-red-500 text-white font-display text-[10px] font-bold leading-[17px]
                                 text-center tabular-nums">
                  {l.badge > 99 ? '99' : l.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            title={theme === 'nuit' ? 'Passer en clair' : 'Passer en sombre'}
            className="nav-dim hover:bg-white/10 rounded-md px-1.5 sm:px-2 py-1.5 text-sm transition-colors"
          >
            {theme === 'nuit' ? '☀️' : '🌙'}
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

          <button
            onClick={logout}
            title="Se déconnecter"
            className="nav-dim hover:text-red-400 text-sm px-1 shrink-0 transition-colors"
          >
            ↪
          </button>
        </div>
      </div>
    </nav>
  );
}
