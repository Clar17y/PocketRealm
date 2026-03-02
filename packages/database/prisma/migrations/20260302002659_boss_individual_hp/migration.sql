/*
  Warnings:

  - You are about to drop the column `raid_pool_hp` on the `boss_encounters` table. All the data in the column will be lost.
  - You are about to drop the column `raid_pool_max` on the `boss_encounters` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `boss_participants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "boss_encounters" DROP COLUMN "raid_pool_hp",
DROP COLUMN "raid_pool_max",
ADD COLUMN     "boss_effects" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "boss_participants" DROP COLUMN "role",
ADD COLUMN     "current_mana" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "current_stamina" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "damage_absorbed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "template_round" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "threat" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "player_boss_rotations" (
    "player_id" TEXT NOT NULL,
    "mob_template_id" TEXT NOT NULL,
    "rounds_revealed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_boss_rotations_pkey" PRIMARY KEY ("player_id","mob_template_id")
);

-- AddForeignKey
ALTER TABLE "player_boss_rotations" ADD CONSTRAINT "player_boss_rotations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_boss_rotations" ADD CONSTRAINT "player_boss_rotations_mob_template_id_fkey" FOREIGN KEY ("mob_template_id") REFERENCES "mob_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
