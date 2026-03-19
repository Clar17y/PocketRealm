-- AlterTable
ALTER TABLE "players" ADD COLUMN     "show_bestiary_lore" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_item_flavour_text" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_npc_dialogue" BOOLEAN NOT NULL DEFAULT true;
