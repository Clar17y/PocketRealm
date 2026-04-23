/*
  Warnings:

  - You are about to drop the column `player_id` on the `email_verification_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `player_id` on the `password_reset_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `is_premium` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `password_hash` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `premium_expires_at` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `premium_trial_claimed` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `player_id` on the `refresh_tokens` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[account_id,season_id]` on the table `players` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `account_id` to the `email_verification_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `password_reset_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `players` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `refresh_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "email_verification_tokens" DROP CONSTRAINT "email_verification_tokens_player_id_fkey";

-- DropForeignKey
ALTER TABLE "friend_mails" DROP CONSTRAINT "friend_mails_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "friend_mails" DROP CONSTRAINT "friend_mails_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_receiver_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_player_id_fkey";

-- DropForeignKey
ALTER TABLE "player_blocks" DROP CONSTRAINT "player_blocks_blocked_id_fkey";

-- DropForeignKey
ALTER TABLE "player_blocks" DROP CONSTRAINT "player_blocks_blocker_id_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_player_id_fkey";

-- DropIndex
DROP INDEX "email_verification_tokens_player_id_idx";

-- DropIndex
DROP INDEX "password_reset_tokens_player_id_idx";

-- DropIndex
DROP INDEX "players_email_key";

-- DropIndex
DROP INDEX "refresh_tokens_player_id_idx";

-- AlterTable
ALTER TABLE "crafting_recipes" ADD COLUMN     "season_id" TEXT;

-- AlterTable
ALTER TABLE "email_verification_tokens" DROP COLUMN "player_id",
ADD COLUMN     "account_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "season_id" TEXT;

-- AlterTable
ALTER TABLE "item_templates" ADD COLUMN     "season_id" TEXT;

-- AlterTable
ALTER TABLE "mob_templates" ADD COLUMN     "season_id" TEXT;

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "player_id",
ADD COLUMN     "account_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "players" DROP COLUMN "email",
DROP COLUMN "email_verified",
DROP COLUMN "is_premium",
DROP COLUMN "password_hash",
DROP COLUMN "premium_expires_at",
DROP COLUMN "premium_trial_claimed",
DROP COLUMN "role",
ADD COLUMN     "account_id" TEXT NOT NULL,
ADD COLUMN     "season_id" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "player_id",
ADD COLUMN     "account_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "season_id" TEXT;

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'player',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "active_player_id" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "premium_trial_claimed" BOOLEAN NOT NULL DEFAULT false,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "premium_expires_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'upcoming',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "constant_overrides" JSONB,
    "features" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_archives" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "character_level" INTEGER NOT NULL,
    "character_xp" BIGINT NOT NULL,
    "attributes" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "combat_templates" JSONB NOT NULL DEFAULT '[]',
    "leaderboard_ranks" JSONB NOT NULL DEFAULT '{}',
    "rewards_earned" JSONB NOT NULL DEFAULT '{}',
    "merge_log" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hall_of_fame_entries" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "rank" INTEGER NOT NULL,
    "account_id" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hall_of_fame_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_reward_tiers" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "min_rank" INTEGER NOT NULL,
    "max_rank" INTEGER NOT NULL,
    "rewards" JSONB NOT NULL,

    CONSTRAINT "season_reward_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_active_player_id_key" ON "accounts"("active_player_id");

-- CreateIndex
CREATE INDEX "seasons_status_idx" ON "seasons"("status");

-- CreateIndex
CREATE UNIQUE INDEX "season_archives_account_id_season_id_key" ON "season_archives"("account_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "hall_of_fame_entries_season_id_category_rank_key" ON "hall_of_fame_entries"("season_id", "category", "rank");

-- CreateIndex
CREATE INDEX "crafting_recipes_season_id_idx" ON "crafting_recipes"("season_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_account_id_idx" ON "email_verification_tokens"("account_id");

-- CreateIndex
CREATE INDEX "guilds_season_id_idx" ON "guilds"("season_id");

-- CreateIndex
CREATE INDEX "item_templates_season_id_idx" ON "item_templates"("season_id");

-- CreateIndex
CREATE INDEX "mob_templates_season_id_idx" ON "mob_templates"("season_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_account_id_idx" ON "password_reset_tokens"("account_id");

-- CreateIndex
CREATE INDEX "players_account_id_idx" ON "players"("account_id");

-- CreateIndex
CREATE INDEX "players_season_id_idx" ON "players"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_account_id_season_id_key" ON "players"("account_id", "season_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_account_id_idx" ON "refresh_tokens"("account_id");

-- CreateIndex
CREATE INDEX "zones_season_id_idx" ON "zones"("season_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_player_id_fkey" FOREIGN KEY ("active_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_archives" ADD CONSTRAINT "season_archives_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_archives" ADD CONSTRAINT "season_archives_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_entries" ADD CONSTRAINT "hall_of_fame_entries_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_entries" ADD CONSTRAINT "hall_of_fame_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_reward_tiers" ADD CONSTRAINT "season_reward_tiers_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_templates" ADD CONSTRAINT "item_templates_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mob_templates" ADD CONSTRAINT "mob_templates_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_recipes" ADD CONSTRAINT "crafting_recipes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_mails" ADD CONSTRAINT "friend_mails_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_mails" ADD CONSTRAINT "friend_mails_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
