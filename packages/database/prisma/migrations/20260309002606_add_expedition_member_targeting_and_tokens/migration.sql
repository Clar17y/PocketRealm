-- AlterTable
ALTER TABLE "guild_expedition_members" ADD COLUMN     "target_mob_id" TEXT,
ADD COLUMN     "tokens_earned" INTEGER NOT NULL DEFAULT 0;
