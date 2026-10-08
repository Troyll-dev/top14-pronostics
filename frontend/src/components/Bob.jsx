import { useState } from 'react';
import api from '../api/client';

/**
 * Bob le poulpe.
 *
 * Deux services rendus par la même bestiole, et c'est pour ça qu'ils tiennent
 * dans un seul bloc : **remplir** les cases vides, et **donner son avis** sur ce
 * qui est déjà rempli. L'un sert quand on est en retard, l'autre quand on a fini
 * — donc il y a toujours quelque chose à faire avec Bob, et le bloc ne disparaît
 * plus jamais de la page.
 *
 * ---------------------------------------------------------------------------
 * Les états
 * ---------------------------------------------------------------------------
 *
 * Il y en a quatre, et un seul tient à la fois :
 *
 *  - **trop loin** — la journée est à plus de deux journées devant celle de la
 *    semaine. Bob ne remplit pas, et le dit plutôt que de disparaître : un bloc
 *    absent n'explique pas son absence.
 *  - **des cases vides** — il propose de les remplir.
 *  - **tout saisi, rien envoyé** — c'est le cas que tu as demandé d'ajouter, et
 *    c'est le plus utile des quatre. Des scores tapés mais pas validés ne
 *    comptent pour rien : ils vivent dans ce navigateur et nulle part ailleurs.
 *    Le bloc « Tout valider » le dit déjà, mais il est plus bas et on peut très
 *    bien le manquer. Bob le redit, en avertissement.
 *  - **tout est posé** — plus rien à remplir. Bob n'est pas pour autant inutile :
 *    c'est le moment de lui demander ce qu'il en pense.
 *
 * ---------------------------------------------------------------------------
 * L'avis
 * ---------------------------------------------------------------------------
 *
 * Un jeu, et il faut qu'il en garde le ton. Bob ne sait rien de plus que les
 * moyennes de points : ni les blessures, ni la pluie, ni le fait qu'une équipe
 * joue mal sur ce terrain-là depuis dix ans. Il ne corrige donc pas une copie,
 * il donne son avis, et un joueur qui s'écarte de lui n'a pas tort — il a une
 * autre idée, ce qui est exactement l'intérêt du concours.
 *
 * Les répliques elles-mêmes vivent côté serveur, dans `bob.service.js`, et pas
 * ici. Elles ont des conditions de déclenchement — des seuils, un cas prioritaire
 * quand on ne voit pas le même vainqueur — et tout ce qui a des conditions
 * mérite un test. Ce composant ne décide de rien : il affiche ce qu'on lui
 * répond, et choisit seulement une couleur par ton.
 *
 * On peut demander l'avis autant de fois qu'on veut, y compris sur une journée
 * terminée — c'est au fond le moment le plus drôle, puisqu'on sait alors lequel
 * des deux avait raison.
 */

/**
 * Une couleur par ton, du plus flatteur au plus moqueur.
 *
 * Toutes passent par des classes de palette et non par des codes fixes : elles
 * se posent sur le fond de la carte, qui change avec le thème, donc elles
 * doivent changer avec lui.
 *
 * Le liseré de la carte, lui, est en dur — `#b9432f`, la brique du poulpe,
 * relevée sur l'image. Un liseré n'a pas de texte à porter, donc pas de contraste
 * à tenir, et celui-là est une couleur d'identité : c'est Bob, pas une nuance du
 * thème. Il fallait surtout qu'il ne soit pas violet, couleur déjà prise par le
 * joker ×2 — deux accents de la même teinte pour deux choses sans rapport, et on
 * finit par croire qu'elles en ont un.
 */
const COULEUR = {
  accord: 'text-green-400',
  proche: 'text-slate-400',
  tiede: 'text-amber-400',
  loin: 'text-orange-500',
  desaccord: 'text-red-400',
};

export default function Bob({
  round,
  regles,
  matches = [],
  aRemplir = 0,
  aValider = 0,
  onFait,
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [bilan, setBilan] = useState(null);
  const [avis, setAvis] = useState(null);
  const [chargeAvis, setChargeAvis] = useState(false);

  // Tant que les règles ne sont pas chargées, on ne montre rien plutôt qu'un
  // bouton dont on ignore s'il est utilisable.
  if (regles?.bobOk === undefined) return null;

  const trop = !regles.bobOk;
  const poses = matches.length - aRemplir;

  const lancer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.post('/predictions/bob', { round });
      setBilan(data);
      setAvis(null); // l'avis d'avant ne vaut plus pour la grille d'après
      onFait?.();
    } catch (err) {
      setErreur(err.response?.data?.error || 'Bob n’a pas répondu');
    } finally {
      setEnvoi(false);
    }
  };

  const demanderAvis = async () => {
    if (avis) { setAvis(null); return; } // deuxième clic : on referme
    setChargeAvis(true);
    setErreur(null);
    try {
      const { data } = await api.get(`/predictions/round/${round}/avis`);
      setAvis(data);
    } catch (err) {
      setErreur(err.response?.data?.error || 'Bob n’a pas d’avis aujourd’hui');
    } finally {
      setChargeAvis(false);
    }
  };

  /** Le titre et la phrase d'explication, selon l'état. */
  const titre = () => {
    if (trop) return `Trop loin devant : Bob s’arrête à la J${regles.bobLimite}.`;
    if (aRemplir > 0) {
      return `Il remplit ${aRemplir === 1 ? 'la case restée vide' : `les ${aRemplir} cases restées vides`} d’après la forme des clubs. Tu peux corriger ensuite.`;
    }
    if (aValider > 0) {
      return `Attention : ${aValider} prono${aValider > 1 ? 's sont saisis' : ' est saisi'} mais pas encore envoyé${aValider > 1 ? 's' : ''}.`;
    }
    return 'Pas besoin de Bob : tous tes pronos sont posés et validés.';
  };

  const alerte = !trop && aRemplir === 0 && aValider > 0;

  return (
    <div className={`card mb-5 border-l-4 ${alerte ? 'border-l-amber-500' : 'border-l-[#b9432f]'}`}>
      <div className="flex items-start gap-3">
        <img
          src="/bob-192.webp"
          srcSet="/bob-96.webp 96w, /bob-192.webp 192w, /bob-384.webp 384w"
          sizes="56px"
          alt=""
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          className="w-14 h-14 shrink-0 select-none"
        />

        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[15px]">Bob le poulpe</p>
          <p className={`text-[12px] mt-0.5 ${alerte ? 'text-amber-400' : 'text-slate-500'}`}>
            {titre()}
          </p>

          {!trop && aRemplir > 0 && (
            <p className="text-[11.5px] text-slate-600 mt-1">
              Autant de fois que tu veux, mais pas plus de {regles.bobAvanceMax ?? 2} journées
              d’avance.
            </p>
          )}

          {trop && (
            <p className="text-[11.5px] text-slate-600 mt-1">
              Reviens quand la journée approchera.
            </p>
          )}

          {(!trop || poses > 0) && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {!trop && aRemplir > 0 && (
                <button
                  onClick={lancer}
                  disabled={envoi}
                  className="btn-primary text-[13.5px] shrink-0"
                >
                  {envoi ? 'Bob réfléchit…' : 'Demander à Bob'}
                </button>
              )}

              {/* L'avis n'a de sens que s'il y a quelque chose à commenter. Bob
                  ne juge pas une grille vide : sur celle-là, il propose de la
                  remplir, et c'est l'autre bouton. */}
              {poses > 0 && (
                <button
                  onClick={demanderAvis}
                  disabled={chargeAvis}
                  className="text-[12.5px] font-display font-bold text-orange-400 hover:text-orange-300 transition-colors px-1"
                >
                  {chargeAvis ? 'Bob relit…' : avis ? 'Replier son avis' : 'Qu’en pense Bob ?'}
                </button>
              )}
            </div>
          )}

          {bilan && (
            <p className="mt-3 pt-3 border-t border-slate-800 text-[12.5px] text-green-400">
              {bilan.remplis > 0
                ? `${bilan.remplis} prono${bilan.remplis > 1 ? 's' : ''} rempli${bilan.remplis > 1 ? 's' : ''}`
                : 'Rien à remplir'}
              {bilan.jokerMatchId ? ' · joker posé au hasard' : ''}
            </p>
          )}

          {avis && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              {avis.verdict && (
                <p className="text-[12.5px] italic text-slate-400 mb-2.5">« {avis.verdict} »</p>
              )}

              <div className="space-y-1.5">
                {avis.lignes.map((l) => {
                  const m = matches.find((x) => x.id === l.matchId);
                  return (
                    <div key={l.matchId} className="text-[11.5px] leading-snug">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display font-bold text-slate-400 truncate">
                          {m ? `${m.homeTeam.shortName}–${m.awayTeam.shortName}` : `Match ${l.matchId}`}
                        </span>
                        <span className="tabular-nums text-slate-600 shrink-0">
                          toi {l.moi.home}-{l.moi.away} · Bob {l.bob.home}-{l.bob.away}
                        </span>
                      </div>
                      <p className={`${COULEUR[l.ton] || 'text-slate-500'}`}>{l.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {erreur && (
            <p className="mt-3 pt-3 border-t border-slate-800 text-[12.5px] text-red-400">{erreur}</p>
          )}
        </div>
      </div>
    </div>
  );
}
