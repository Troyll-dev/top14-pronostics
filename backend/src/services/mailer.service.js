const axios = require('axios');

/**
 * Envoi d'e-mails, par Brevo ou par SMTP.
 *
 * Deux chemins, choisis automatiquement selon les variables presentes :
 *
 *   BREVO_API_KEY defini  -> API HTTP de Brevo (aucune dependance en plus)
 *   sinon SMTP_USER + SMTP_PASS -> SMTP via nodemailer (Gmail par exemple)
 *
 * Cette souplesse n'est pas gratuite en lignes de code, mais elle evite d'etre
 * bloque : Brevo passe les nouveaux comptes gratuits en revue manuelle avant
 * d'ouvrir l'envoi, ce qui prend parfois deux jours. On demarre en SMTP, et le
 * jour ou le compte est valide il suffit d'ajouter la cle : le code bascule
 * tout seul, Brevo etant essaye en premier.
 *
 * Variables communes :
 *   MAIL_FROM       l'adresse d'expedition
 *   MAIL_FROM_NAME  le nom affiche (defaut : Top 14 Pronos)
 *   APP_URL         l'adresse du site, pour construire les liens
 *
 * Pour Gmail : SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=ton adresse,
 * SMTP_PASS=un mot de passe d'application (pas ton mot de passe habituel).
 */
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function config() {
  return {
    brevoKey: process.env.BREVO_API_KEY,
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    fromName: process.env.MAIL_FROM_NAME || 'Top 14 Pronos',
    appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  };
}

/** Quel chemin d'envoi est utilisable, s'il y en a un. */
function provider() {
  const c = config();
  if (!c.from || !c.appUrl) return null;
  if (c.brevoKey) return 'brevo';
  if (c.smtp.user && c.smtp.pass) return 'smtp';
  return null;
}

function isConfigured() {
  return provider() !== null;
}

/**
 * Le gabarit commun, aux couleurs du site.
 *
 * Un courriel ne se construit pas comme une page. Trois contraintes decident de
 * tout ce qui suit, et elles expliquent pourquoi ce code a l'air d'avoir vingt
 * ans :
 *
 * 1. **Tableaux et styles en ligne.** Outlook sur Windows utilise le moteur de
 *    rendu de Word : ni flexbox, ni grille, ni variables CSS, ni feuille de
 *    style externe. Une mise en page qui tient partout se fait en `<table>`,
 *    avec les styles ecrits sur chaque balise.
 *
 * 2. **Les images sont bloquees par defaut** dans la plupart des logiciels de
 *    courrier, et l'on ne sait jamais si le destinataire les affichera. Le
 *    message doit donc rester complet sans elles : le bandeau porte un texte de
 *    remplacement, et aucune information ne vit uniquement dans une image.
 *
 * 3. **Pas de WebP.** Outlook et plusieurs clients ne le lisent pas. Le bandeau
 *    est servi en JPEG, dans un fichier distinct de celui du site.
 *
 * Le filigrane du site n'est pas repris, et c'est un choix. Il faudrait une
 * image de fond, que Outlook n'affiche qu'au prix de balises VML proprietaires
 * — et un filigrane a vingt pour cent d'opacite qui se dessine chez les uns et
 * pas chez les autres ne ressemble pas a un decor, mais a un defaut
 * d'affichage.
 *
 * Les couleurs sont celles du theme creme : le papier, l'encre, le vert des
 * boutons et l'ambre des accents. Elles sont ecrites en clair et non par des
 * variables, pour la raison 1.
 */

// Le papier, l'encre et les accents du theme creme. En clair : un courriel n'a
// pas de variables CSS, et de toute facon il n'a qu'un seul theme.
const C = {
  fond: '#f0ece0',       // le pourtour, plus soutenu que la carte
  papier: '#fbf8ec',     // la carte
  bord: '#e3dcc6',
  encre: '#1c1917',
  encreDouce: '#6b6357',
  encrePale: '#9a9184',
  vert: '#14532d',
  ambre: '#b4863b',
};

function wrap(title, intro, buttonLabel, link, footer) {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  const bandeau = base ? `${base}/pub-mail.jpg` : null;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.fond};">
  <!-- Texte d'apercu : ce que la boite de reception montre a cote de l'objet.
       Masque dans le message lui-meme par une taille nulle. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${title}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fond};">
    <tr><td align="center" style="padding:24px 12px;">

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="width:560px;max-width:100%;background:${C.papier};border:1px solid ${C.bord};border-radius:14px;overflow:hidden;">

        ${bandeau ? `
        <tr><td style="padding:0;line-height:0;font-size:0;">
          <a href="${link}" style="text-decoration:none;">
            <!-- alt vide, et c'est voulu : le bandeau est purement decoratif.
                 Un texte de remplacement s'affiche en toutes lettres quand les
                 images sont bloquees — ce qui est le cas par defaut dans la
                 plupart des logiciels de courrier — et l'on se retrouve avec une
                 ligne de texte orpheline au-dessus du message. Rien a dire vaut
                 mieux que dire le nom d'un pub. -->
            <img src="${bandeau}" width="560" alt="" role="presentation"
                 style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;">
          </a>
        </td></tr>` : ''}

        <tr><td style="padding:26px 30px 30px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.encre};">

          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${C.ambre};font-weight:700;">🏉 Top 14 Pronos</p>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;font-weight:800;color:${C.encre};">${title}</h1>

          <div style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${C.encre};">${intro}</div>

          <!-- Le bouton en tableau : c'est la seule forme qu'Outlook remplit
               entierement. Un lien avec du remplissage y perd sa couleur de
               fond sur les bords. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
            <tr><td bgcolor="${C.vert}" style="border-radius:8px;">
              <a href="${link}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#f7f4e9;text-decoration:none;border-radius:8px;">${buttonLabel}</a>
            </td></tr>
          </table>

          <p style="margin:0 0 4px;font-size:12.5px;color:${C.encreDouce};line-height:1.6;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>
          <p style="margin:0 0 22px;font-size:12px;color:${C.encreDouce};word-break:break-all;">${link}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-top:1px solid ${C.bord};font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>

          <p style="margin:18px 0 0;font-size:12px;color:${C.encrePale};line-height:1.65;">${footer}</p>

        </td></tr>
      </table>

    </td></tr>
  </table>
</body></html>`;
}

async function sendViaBrevo(c, { to, subject, html, text, attachments }) {
  await axios.post(
    BREVO_URL,
    {
      sender: { name: c.fromName, email: c.from },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      // Brevo attend le contenu en base64 ; nodemailer veut un Buffer. On
      // garde donc l'interface commune en Buffer et on convertit ici.
      ...(attachments?.length
        ? {
            attachment: attachments.map((a) => ({
              name: a.name,
              content: Buffer.from(a.content).toString('base64'),
            })),
          }
        : {}),
    },
    { headers: { 'api-key': c.brevoKey, 'content-type': 'application/json' }, timeout: 15000 }
  );
}

let transport = null;

async function sendViaSmtp(c, { to, subject, html, text, attachments }) {
  let nodemailer;
  try {
    // Charge a la demande : si l'on n'utilise que Brevo, le paquet n'a pas
    // besoin d'etre installe.
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('Le paquet nodemailer est absent : npm install nodemailer');
  }

  if (!transport) {
    transport = nodemailer.createTransport({
      host: c.smtp.host,
      port: c.smtp.port,
      secure: c.smtp.port === 465,
      auth: { user: c.smtp.user, pass: c.smtp.pass },
    });
  }

  await transport.sendMail({
    from: `"${c.fromName}" <${c.from}>`,
    to, subject, html, text,
    ...(attachments?.length
      ? { attachments: attachments.map((a) => ({ filename: a.name, content: a.content })) }
      : {}),
  });
}

async function send(message) {
  const c = config();
  const how = provider();
  if (!how) throw new Error('Envoi d e-mails non configure');

  if (how === 'brevo') await sendViaBrevo(c, message);
  else await sendViaSmtp(c, message);

  console.log(`[mail] ${message.subject} -> ${message.to} (${how})`);
}

/** Reinitialisation de mot de passe. */
async function sendPasswordReset(to, username, token) {
  const link = `${config().appUrl}/reinitialiser?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Réinitialise ton mot de passe',
    html: wrap(
      'Nouveau mot de passe',
      `Salut ${username}, quelqu'un — toi, sans doute — a demandé à réinitialiser le mot de passe de ton compte.`,
      'Choisir un nouveau mot de passe',
      link,
      'Ce lien est valable une heure et ne sert qu\'une fois. Si tu n\'as rien demandé, ignore ce message : ton mot de passe reste inchangé.'
    ),
    text: `Salut ${username}, réinitialise ton mot de passe : ${link}\nCe lien est valable une heure.`,
  });
}

module.exports = { isConfigured, provider, send, wrap, sendPasswordReset };
