-- AlterTable
ALTER TABLE "guilds" ALTER COLUMN "recruitment_mode" SET DEFAULT 'request_to_join';

-- DataMigration: rename existing invite_only rows
UPDATE "guilds" SET "recruitment_mode" = 'request_to_join' WHERE "recruitment_mode" = 'invite_only';
