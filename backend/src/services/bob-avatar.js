/**
 * La photo de profil de Bob, en dur.
 *
 * Bob est un compte comme un autre dans le salon : il lui faut donc une image
 * dans `user_avatars`, comme pour n'importe qui. Elle ne peut pas venir du
 * dossier `public` du site — c'est le frontend, deploye ailleurs, et le serveur
 * n'y a pas acces — ni d'une adresse distante, qui ferait dependre la creation
 * du compte d'un telechargement.
 *
 * Elle est donc ici, encodee en base64 : le poulpe de 128 pixels sur un aplat
 * violet, cinq kilo-octets. C'est laid a lire et c'est le seul moyen d'etre sur
 * que Bob a son visage des la premiere inscription, sans dependance et sans
 * etape manuelle.
 */
const BOB_AVATAR_WEBP_BASE64 =
  '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' +
  'AA==';

module.exports = { BOB_AVATAR_WEBP_BASE64 };
