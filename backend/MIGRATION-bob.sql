-- ---------------------------------------------------------------------------
-- Le marqueur « ce compte n'est pas tenu par une personne ».
--
-- A executer dans la console SQL de la base Railway AVANT de pousser le code.
-- Un seul compte le portera : Bob le poulpe, qui signe le message de bienvenue
-- au Comptoir. Il se cree tout seul a la premiere inscription — il n'y a pas de
-- ligne a inserer ici.
--
-- Sans danger : la colonne arrive a `false` pour les huit comptes existants,
-- c'est-a-dire exactement ce qu'ils sont. Et la rejouer ne fait rien.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "bot" BOOLEAN NOT NULL DEFAULT false;
