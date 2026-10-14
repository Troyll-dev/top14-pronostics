-- ---------------------------------------------------------------------------
-- La meteo des rencontres.
--
-- A executer dans la console SQL de la base Railway AVANT de pousser le code.
--
-- IMPORTANT, et on s'est deja fait avoir ce soir : le serveur lit la table
-- `matches` en entier a chaque page du site. Si le code arrive avant ces deux
-- colonnes, ce n'est pas la meteo qui manque, c'est le site qui tombe.
--
-- Sans danger : deux colonnes nullables, aucune contrainte, aucune donnee
-- touchee. Et la rejouer ne fait rien.
-- ---------------------------------------------------------------------------

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "meteo"   JSONB,
  ADD COLUMN IF NOT EXISTS "meteoAt" TIMESTAMP(3);
