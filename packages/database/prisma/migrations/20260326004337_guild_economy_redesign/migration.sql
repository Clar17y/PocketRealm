-- AlterTable
ALTER TABLE "guild_contracts" ADD COLUMN     "reward_renown" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "expedition_cooldowns" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expedition_cooldowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expedition_cooldowns_player_id_expires_at_idx" ON "expedition_cooldowns"("player_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "expedition_cooldowns_player_id_tier_key" ON "expedition_cooldowns"("player_id", "tier");

-- AddForeignKey
ALTER TABLE "expedition_cooldowns" ADD CONSTRAINT "expedition_cooldowns_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
