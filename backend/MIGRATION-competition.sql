-- ---------------------------------------------------------------------------
-- La compétition de chaque match.
--
-- À exécuter dans la console SQL de la base Railway AVANT de pousser le code :
-- le serveur filtre sur cette colonne dès la page d'accueil, et si le code
-- arrive avant elle, ce n'est pas une page qui manque, c'est le site qui tombe.
--
-- Sans danger : une colonne avec une valeur par défaut, et un index. Les 182
-- matchs existants prennent « TOP14 » sans qu'on les touche.
--
-- Deux instructions simples, sans bloc DO : c'est ce qui passe le mieux dans
-- la console Railway. Chacune peut être relancée sans effet si elle a déjà été
-- exécutée.
-- ---------------------------------------------------------------------------

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "competition" TEXT NOT NULL DEFAULT 'TOP14';

CREATE INDEX IF NOT EXISTS "matches_competition_season_round_idx"
  ON "matches" ("competition", "season", "round");

-- Vérification : une seule ligne, TOP14, avec le nombre total de matchs.
SELECT "competition", COUNT(*) FROM "matches" GROUP BY "competition";
