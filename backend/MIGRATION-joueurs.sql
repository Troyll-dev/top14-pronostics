-- ---------------------------------------------------------------------------
-- La table des adresses bannies.
--
-- A executer dans la console SQL de la base Railway AVANT de pousser le code.
-- Dans l'autre ordre, le serveur redemarre avec un client Prisma qui connait
-- une table absente, et toute la page d'administration repond par une erreur.
--
-- Rien n'est touche d'existant : c'est une creation de table, sans contrainte
-- vers les autres. Elle est donc sans danger et se rejoue sans effet grace aux
-- `IF NOT EXISTS`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "adresses_bannies" (
  "id"        SERIAL       PRIMARY KEY,
  "email"     TEXT         NOT NULL,
  "cle"       TEXT         NOT NULL,
  "motif"     VARCHAR(200),
  "parEmail"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- L'unicite porte sur la cle normalisee, jamais sur l'adresse saisie :
-- « Jean@Gmail.com » et « jean@gmail.com » sont la meme boite, et on ne veut pas
-- deux lignes pour une seule personne.
CREATE UNIQUE INDEX IF NOT EXISTS "adresses_bannies_cle_key"
  ON "adresses_bannies" ("cle");
