-- AlterTable
ALTER TABLE "players" ADD COLUMN     "tutorial_step" INTEGER NOT NULL DEFAULT 0;

UPDATE "players" SET "tutorial_step" = 8 WHERE "tutorial_step" = 0;
