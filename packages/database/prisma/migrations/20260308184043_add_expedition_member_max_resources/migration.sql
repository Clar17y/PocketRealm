/*
  Warnings:

  - Added the required column `max_hp` to the `guild_expedition_members` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_mana` to the `guild_expedition_members` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_stamina` to the `guild_expedition_members` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "guild_expedition_members" ADD COLUMN     "max_hp" INTEGER NOT NULL,
ADD COLUMN     "max_mana" INTEGER NOT NULL,
ADD COLUMN     "max_stamina" INTEGER NOT NULL;
