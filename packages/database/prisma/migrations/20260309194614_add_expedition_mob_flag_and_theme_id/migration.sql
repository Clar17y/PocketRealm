-- AlterTable
ALTER TABLE "guild_expeditions" ADD COLUMN     "theme_id" VARCHAR(64);

-- AlterTable
ALTER TABLE "mob_templates" ADD COLUMN     "is_expedition_mob" BOOLEAN NOT NULL DEFAULT false;
