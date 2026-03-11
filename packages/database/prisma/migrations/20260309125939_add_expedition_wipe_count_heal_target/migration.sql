-- AlterTable
ALTER TABLE "guild_expedition_members" ADD COLUMN     "heal_target_player_id" TEXT;

-- AlterTable
ALTER TABLE "guild_expeditions" ADD COLUMN     "expedition_attempt_logs" JSONB,
ADD COLUMN     "wipe_count" INTEGER NOT NULL DEFAULT 0;
