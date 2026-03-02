-- AlterTable
ALTER TABLE "player_stats" ADD COLUMN     "peak_gold_held" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_bets_placed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_gold_wagered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_turns_exchanged" INTEGER NOT NULL DEFAULT 0;
