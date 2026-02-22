-- AlterTable
ALTER TABLE "players" ADD COLUMN     "auto_skip_known_combat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "combat_log_speed_ms" INTEGER NOT NULL DEFAULT 800,
ADD COLUMN     "default_explore_turns" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "default_refining_max" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exploration_speed_ms" INTEGER NOT NULL DEFAULT 800,
ADD COLUMN     "quick_rest_heal_percent" INTEGER NOT NULL DEFAULT 100;
