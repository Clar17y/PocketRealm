-- AlterTable
ALTER TABLE "guild_contracts" ADD COLUMN     "reward_guild_xp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reward_treasury_turns" INTEGER NOT NULL DEFAULT 0;
