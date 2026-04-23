DROP INDEX IF EXISTS "players_username_key";

CREATE UNIQUE INDEX "players_permanent_username_key"
ON "players"("username")
WHERE "season_id" IS NULL;

CREATE UNIQUE INDEX "players_season_username_key"
ON "players"("season_id", "username")
WHERE "season_id" IS NOT NULL;
