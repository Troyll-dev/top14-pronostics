import { Link } from 'react-router-dom';

function Rule({ points, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-slate-400">{children}</span>
      <span className="font-display font-bold text-amber-500 shrink-0">{points}</span>
    </div>
  );
}

/**
 * Le bandeau du pub.
 *
 * Une photo, donc opaque : c'est le seul element des trois pages de demarrage
 * qui ne bascule pas avec le theme. C'est assume — une enseigne eclaire pareil
 * de jour comme de nuit — et ca evite le piege inverse, une image detouree sur
 * fond sombre dont les noirs se fondraient dans la page.
 *
 * Le bas se fond dans le fond par un masque en degrade, pour qu'il n'y ait pas
 * de bord net entre la photo et la page. Meme principe que le bandeau des
 * joueurs ailleurs sur le site.
 *
 * Bord a bord sur telephone, arrondi des qu'il y a de la place : une photo qui
 * touche les deux cotes de l'ecran a de l'ampleur, la meme photo avec seize
 * pixels de marge de chaque cote a l'air d'avoir rate son cadre.
 *
 * `aspect-ratio` plutot qu'une hauteur : le cadrage reste identique partout, et
 * la place est reservee avant meme que l'image arrive — donc rien ne saute quand
 * elle finit de charger.
 */
function BandeauPub() {
  return (
    <div
      aria-hidden="true"
      className="-mx-4 sm:mx-0 sm:rounded-xl overflow-hidden mb-2"
      style={{
        WebkitMaskImage: 'linear-gradient(#000 74%, transparent 100%)',
        maskImage: 'linear-gradient(#000 74%, transparent 100%)',
      }}
    >
      <img
        src="/pub-accueil-1008.webp"
        srcSet="/pub-accueil-672.webp 672w, /pub-accueil-1008.webp 1008w, /pub-accueil-1344.webp 1344w"
        sizes="(min-width: 768px) 768px, 100vw"
        alt=""
        width={1008}
        height={567}
        decoding="async"
        className="block w-full h-auto object-cover"
        style={{ aspectRatio: '1.78', objectPosition: 'center 42%' }}
      />
    </div>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-screen">
      {/* Bandeau d'en-tête */}
      <header className="nav-band">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="nav-tx font-display font-bold text-base tracking-wide flex items-center gap-2">
            🏉 Top 14 Pronos
          </span>
          <Link to="/login" className="nav-dim hover:nav-tx text-sm transition-colors">
            Connexion
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        {/* Accroche */}
        <section className="text-center pt-4 pb-12 relative">
          {/* L'emoji ballon de 64 pixels a disparu d'ici : il tenait lieu
              d'identite faute de mieux, et une photo du pub dit la meme chose
              en mieux. Il reste dans la barre du haut, ou il sert de marque. */}
          <BandeauPub />

          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.05] mb-4 mt-6">
            Rugby.<br />
            <span className="text-amber-500">Amis.</span><br />
            Bière.
          </h1>

          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md mx-auto mb-2">
            Le championnat de France, une bande de potes, et la mauvaise foi
            de celui qui avait « senti le coup venir ».
          </p>
          <p className="text-slate-500 text-sm italic max-w-md mx-auto">
            Chacun pronostique les scores des sept matchs de la journée. Les points
            tombent le lundi. Le perdant paie la tournée.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
            <Link to="/register" className="btn-primary text-[15px] px-7 py-2.5">
              Créer mon compte
            </Link>
            <Link
              to="/login"
              className="font-display font-bold text-[15px] px-7 py-2.5 rounded-md border border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-500 transition-colors"
            >
              J'ai déjà un compte
            </Link>
          </div>
        </section>

        {/* Comment ça marche */}
        <section className="pb-4">
          <h2 className="rule-label mb-4">Comment ça marche</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: '1', t: 'Tu pronostiques', d: 'Le score exact de chaque match de la journée, jusqu’au coup d’envoi.' },
              { n: '2', t: 'Les résultats tombent', d: 'Les scores sont récupérés automatiquement et les points calculés seuls.' },
              { n: '3', t: 'On compare', d: 'Le classement se met à jour, et chacun voit les pronos des autres.' },
            ].map((s) => (
              <div key={s.n} className="card">
                <div className="font-display text-amber-500 text-2xl font-extrabold leading-none mb-2">{s.n}</div>
                <p className="font-display font-bold text-[15px] mb-1">{s.t}</p>
                <p className="text-[13px] text-slate-500 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Barème */}
        <section className="py-8">
          <h2 className="rule-label mb-4">Le barème</h2>
          <div className="card stitched">
            <div className="relative z-10 text-sm divide-y divide-slate-800">
              <Rule points="3 pts">🎯 Score exact</Rule>
              <Rule points="2 pts">✅ Bon vainqueur, à moins de 5 points près</Rule>
              <Rule points="1 pt">✅ Bon vainqueur</Rule>
              <Rule points="0 pt">❌ Mauvais vainqueur</Rule>
            </div>
          </div>
        </section>

        <footer className="text-center pb-14 pt-2">
          <p className="text-slate-600 text-xs italic">
            Saison 2026-2027 · 26 journées · une seule tournée à payer
          </p>
        </footer>
      </main>
    </div>
  );
}
