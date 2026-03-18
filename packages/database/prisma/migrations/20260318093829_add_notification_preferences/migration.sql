-- AlterTable
ALTER TABLE "players" ADD COLUMN     "notify_boss_appeared" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_boss_killed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_expedition_finished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_expedition_started" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_pvp_attack" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_pvp_scout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_turn_bank_full" BOOLEAN NOT NULL DEFAULT true;
