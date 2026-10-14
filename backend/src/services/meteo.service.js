const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * La meteo des rencontres a venir.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CETTE DONNEE, ET CE QU'ELLE VAUT
 * ---------------------------------------------------------------------------
 *
 * Le bloc de pronostic montre les moyennes de points des deux clubs, et c'est a
 * peu pres tout ce dont un joueur dispose pour poser un score. La pluie et le
 * vent changent un match de rugby — un soir de bourrasques a La Rochelle ne se
 * pronostique pas comme un apres-midi sec a Toulouse — et c'est une information
 * que personne ne va chercher ailleurs au moment de remplir sa grille.
 *
 * Elle n'entre pas dans le calcul de Bob, et c'est delibere : trois mesures ont
 * montre que son plafond est ailleurs, et lui ajouter une variable dont
 * l'influence n'a pas ete mesuree ne ferait qu'ajouter du bruit a un modele deja
 * au plafond. La meteo est ici pour le joueur, pas pour le robot.
 *
 * ---------------------------------------------------------------------------
 * LA SOURCE
 * ---------------------------------------------------------------------------
 *
 * Open-Meteo : pas de cle, pas d'inscription, gratuit pour un usage non
 * commercial jusqu'a dix mille appels par jour. On en fait sept par semaine.
 *
 * Elle repond a des coordonnees, pas a « Stade Ernest-Wallon ». D'ou la table
 * ci-dessous, ecrite a la main une fois pour toutes. Un stade ne demenage pas,
 * et une table en dur ne tombe jamais en panne — c'est exactement le genre de
 * donnee qui n'a aucune raison d'etre dynamique.
 *
 * ---------------------------------------------------------------------------
 * LA LIMITE A CONNAITRE
 * ---------------------------------------------------------------------------
 *
 * Au-dela d'une dizaine de jours, une prevision ne vaut rien. On ne releve donc
 * que les rencontres proches, et l'absence de meteo sur une journee lointaine
 * n'est pas une panne : c'est la seule reponse honnete. L'ecran devra le dire
 * ainsi — « trop tot pour le savoir » — plutot que de laisser un trou.
 *
 * Et une prevision se corrige : celle de mardi pour samedi n'est pas celle de
 * vendredi pour samedi. On relit donc chaque jour, et `meteoAt` dit quand le
 * releve a ete fait, pour que l'ecran puisse l'indiquer.
 */

/** Jusqu'a combien de jours a l'avance on releve. Au-dela, aucune prevision ne tient. */
const HORIZON_JOURS = 10;

/**
 * Les quatorze stades, en latitude et longitude.
 *
 * Les cles sont normalisees — minuscules, sans accent — et plusieurs formes sont
 * acceptees par club, parce que le nom qui arrive de la source des matchs n'est
 * pas toujours celui qu'on emploie : « Union Bordeaux-Begles », « Bordeaux »,
 * « UBB ». Mieux vaut quelques alias de trop qu'une rencontre sans meteo pour
 * une histoire de tiret.
 *
 * La precision est volontairement modeste : quelques centaines de metres ne
 * changent rien a une prevision horaire, et chercher la position exacte de la
 * pelouse serait du zele sans effet.
 */
const STADES = [
  { cles: ['toulouse', 'stade toulousain', 'st', 'tls'], stade: 'Ernest-Wallon', lat: 43.6206, lon: 1.4079 },
  { cles: ['bordeaux', 'bordeaux-begles', 'union bordeaux begles', 'ubb'], stade: 'Chaban-Delmas', lat: 44.8300, lon: -0.5996 },
  { cles: ['toulon', 'rc toulon', 'rct'], stade: 'Mayol', lat: 43.1206, lon: 5.9344 },
  { cles: ['la rochelle', 'stade rochelais', 'sr'], stade: 'Marcel-Deflandre', lat: 46.1536, lon: -1.1706 },
  { cles: ['bayonne', 'aviron bayonnais', 'ab'], stade: 'Jean-Dauger', lat: 43.4857, lon: -1.4860 },
  { cles: ['stade francais', 'stade francais paris', 'sfp', 'sf'], stade: 'Jean-Bouin', lat: 48.8427, lon: 2.2529 },
  { cles: ['castres', 'castres olympique', 'co'], stade: 'Pierre-Antoine', lat: 43.6090, lon: 2.2436 },
  { cles: ['montpellier', 'mhr'], stade: 'GGL Stadium', lat: 43.6327, lon: 3.8812 },
  { cles: ['lyon', 'lou', 'lou rugby'], stade: 'Matmut Stadium', lat: 45.7256, lon: 4.8320 },
  { cles: ['racing 92', 'racing', 'r92'], stade: 'Paris La Defense Arena', lat: 48.8955, lon: 2.2290 },
  { cles: ['clermont', 'asm clermont', 'asm clermont auvergne', 'asm'], stade: 'Marcel-Michelin', lat: 45.7917, lon: 3.1045 },
  { cles: ['pau', 'section paloise', 'sp'], stade: 'Hameau', lat: 43.3194, lon: -0.3519 },
  { cles: ['vannes', 'rc vannes', 'rcv'], stade: 'La Rabine', lat: 47.6520, lon: -2.7490 },
  { cles: ['perpignan', 'usap'], stade: 'Aime-Giral', lat: 42.7050, lon: 2.8860 },
];

const normaliser = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Le stade du club recevant, ou null si on ne le reconnait pas. */
function stadeDe(equipe) {
  const candidats = [equipe?.name, equipe?.shortName, equipe?.city].map(normaliser).filter(Boolean);
  for (const s of STADES) {
    if (s.cles.some((c) => candidats.includes(c))) return s;
  }
  return null;
}

/**
 * Les codes de temps de l'OMM, traduits.
 *
 * Volontairement court : un joueur veut savoir s'il pleut et s'il vente, pas
 * distinguer une « bruine verglacante legere » d'une « bruine verglacante
 * forte ». Les codes inconnus retombent sur une formule neutre plutot que sur un
 * numero, qui ne dirait rien a personne.
 */
const TEMPS = {
  0: 'ciel dégagé', 1: 'peu nuageux', 2: 'nuages épars', 3: 'couvert',
  45: 'brouillard', 48: 'brouillard givrant',
  51: 'bruine', 53: 'bruine', 55: 'bruine dense',
  61: 'pluie faible', 63: 'pluie', 65: 'forte pluie',
  66: 'pluie verglaçante', 67: 'pluie verglaçante',
  71: 'neige faible', 73: 'neige', 75: 'fortes chutes de neige',
  77: 'grésil',
  80: 'averses', 81: 'averses', 82: 'fortes averses',
  85: 'averses de neige', 86: 'averses de neige',
  95: 'orage', 96: 'orage et grêle', 99: 'orage et grêle',
};

const libelleTemps = (code) => TEMPS[code] || 'temps variable';

/**
 * Le relevé d'une rencontre : une requete, une heure retenue.
 *
 * On demande les previsions horaires jusqu'au jour du match, puis on retient
 * l'heure la plus proche du coup d'envoi. C'est tout l'interet d'avoir fait ce
 * travail cote serveur : une moyenne de la journee annoncerait du soleil pour un
 * match de 21 h sous la pluie.
 *
 * Rend `null` plutot que de jeter quand quelque chose manque — stade inconnu,
 * reponse incomplete, reseau en vrac. Une rencontre sans meteo s'affiche sans
 * meteo ; ce n'est pas un incident digne d'interrompre la passe des six autres.
 */
async function relever(match) {
  const stade = stadeDe(match.homeTeam);
  if (!stade) {
    console.warn(`[meteo] stade inconnu pour « ${match.homeTeam?.name} » — rencontre ignoree`);
    return null;
  }

  const coup = new Date(match.kickoff);
  const jours = Math.ceil((coup - Date.now()) / 86400000) + 1;
  if (jours < 1 || jours > HORIZON_JOURS + 1) return null;

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${stade.lat}&longitude=${stade.lon}` +
    '&hourly=temperature_2m,precipitation,wind_speed_10m,weather_code' +
    `&forecast_days=${Math.min(16, Math.max(1, jours))}` +
    '&timezone=Europe%2FParis';

  const reponse = await fetch(url, { headers: { 'User-Agent': 'top14-pronostics' } });
  if (!reponse.ok) throw new Error(`Open-Meteo a repondu ${reponse.status}`);

  const data = await reponse.json();
  const heures = data?.hourly?.time;
  if (!Array.isArray(heures) || !heures.length) return null;

  // L'heure la plus proche du coup d'envoi. Les horaires arrivent en heure de
  // Paris sans fuseau (« 2026-10-18T21:00 ») : on les lit comme tels, ce qui est
  // coherent puisque `timezone=Europe/Paris` a ete demande.
  let meilleur = 0;
  let distance = Infinity;
  for (let i = 0; i < heures.length; i++) {
    const d = Math.abs(new Date(heures[i]).getTime() - coup.getTime());
    if (d < distance) { distance = d; meilleur = i; }
  }

  // Plus de trois heures d'ecart : la prevision ne porte pas sur ce match.
  if (distance > 3 * 3600 * 1000) return null;

  const code = data.hourly.weather_code?.[meilleur];

  return {
    stade: stade.stade,
    heure: heures[meilleur],
    temperature: Math.round(data.hourly.temperature_2m?.[meilleur]),
    pluie: Number(data.hourly.precipitation?.[meilleur] ?? 0),
    vent: Math.round(data.hourly.wind_speed_10m?.[meilleur]),
    code,
    libelle: libelleTemps(code),
  };
}

/**
 * La passe : toutes les rencontres a venir dans l'horizon.
 *
 * On relit meme celles qui ont deja une meteo — c'est le but. Une prevision
 * faite mardi pour samedi est remplacee vendredi par une meilleure, et la
 * derniere lecture avant le coup d'envoi est celle qui compte.
 *
 * Les rencontres terminees ne sont jamais touchees : la meteo d'un match joue
 * n'interesse plus personne, et ecrire sur une rencontre passee est exactement
 * le genre de geste qu'on ne veut pas voir dans une tache automatique.
 */
async function syncMeteo() {
  const maintenant = new Date();
  const limite = new Date(maintenant.getTime() + HORIZON_JOURS * 86400000);

  const matchs = await prisma.match.findMany({
    where: {
      status: { in: ['SCHEDULED', 'LIVE'] },
      kickoff: { gte: maintenant, lte: limite },
    },
    include: { homeTeam: true },
    orderBy: { kickoff: 'asc' },
  });

  if (!matchs.length) return { reason: 'aucune rencontre dans les dix jours' };

  let releves = 0;
  let ignores = 0;
  const erreurs = [];

  for (const m of matchs) {
    try {
      const meteo = await relever(m);
      if (!meteo) { ignores++; continue; }
      await prisma.match.update({
        where: { id: m.id },
        data: { meteo, meteoAt: new Date() },
      });
      releves++;
    } catch (err) {
      erreurs.push(`${m.id} : ${err.message}`);
    }
  }

  // Une erreur isolee ne doit pas faire echouer la passe — six stades sur sept
  // releves valent mieux que rien. En revanche si tout echoue, c'est la source
  // ou le reseau, et le journal doit le voir.
  if (erreurs.length && !releves) throw new Error(erreurs[0]);
  for (const e of erreurs) console.error(`[meteo] ${e}`);

  return { releves, ignores, erreurs: erreurs.length };
}

module.exports = { syncMeteo, relever, stadeDe, libelleTemps, STADES, HORIZON_JOURS };
