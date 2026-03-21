/*
  Warnings:

  - You are about to drop the column `clear_strategy` on the `encounter_sites` table. All the data in the column will be lost.
  - You are about to drop the column `full_clear_active` on the `encounter_sites` table. All the data in the column will be lost.
  - You are about to drop the column `room_carry_hp` on the `encounter_sites` table. All the data in the column will be lost.

*/
-- Clear ephemeral encounter site data before column changes
DELETE FROM encounter_sites;

-- AlterTable
ALTER TABLE "encounter_sites" DROP COLUMN "clear_strategy",
DROP COLUMN "full_clear_active",
DROP COLUMN "room_carry_hp",
ADD COLUMN     "room_carry_state" JSONB,
ADD COLUMN     "room_strategy" JSONB,
ADD COLUMN     "total_rooms" INTEGER NOT NULL DEFAULT 1;
