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

/** Gabarit commun : sobre, lisible, sans image ni feuille de style externe. */
function wrap(title, intro, buttonLabel, link, footer) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e3ded2">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a7f6d">🏉 Top 14 Pronos</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${title}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">${intro}</p>
    <p style="margin:0 0 24px">
      <a href="${link}" style="display:inline-block;background:#14532d;color:#f4f1ea;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:15px">${buttonLabel}</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.6">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${link}</p>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">${footer}</p>
  </div>
</body></html>`;
}

async function sendViaBrevo(c, { to, subject, html, text }) {
  await axios.post(
    BREVO_URL,
    {
      sender: { name: c.fromName, email: c.from },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    },
    { headers: { 'api-key': c.brevoKey, 'content-type': 'application/json' }, timeout: 15000 }
  );
}

let transport = null;

async function sendViaSmtp(c, { to, subject, html, text }) {
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

/** Confirmation d'une nouvelle adresse — le lien part vers la NOUVELLE adresse. */
async function sendEmailChange(to, username, token) {
  const link = `${config().appUrl}/confirmer-email?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Confirme ta nouvelle adresse',
    html: wrap(
      'Confirme ta nouvelle adresse',
      `Salut ${username}, tu as demandé à utiliser cette adresse pour te connecter à Top 14 Pronos. Clique pour valider le changement.`,
      'Confirmer mon adresse',
      link,
      'Ce lien est valable une heure et ne sert qu\'une fois. Si tu n\'as rien demandé, ignore ce message : ton adresse actuelle reste inchangée.'
    ),
    text: `Salut ${username}, confirme ta nouvelle adresse : ${link}\nCe lien est valable une heure.`,
  });
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

module.exports = { isConfigured, provider, sendEmailChange, sendPasswordReset };
