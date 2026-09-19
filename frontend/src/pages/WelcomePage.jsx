import { Link } from 'react-router-dom';

function Rule({ points, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-slate-400">{children}</span>
      <span className="font-display font-bold text-amber-500 shrink-0">{points}</span>
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
        <section className="text-center pt-14 pb-12 relative">
          <div className="text-[64px] leading-none mb-5 select-none">🏉</div>

          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1.05] mb-4">
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
