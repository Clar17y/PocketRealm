-- AlterTable
ALTER TABLE "item_templates" ADD COLUMN     "sell_price" INTEGER;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "in_stash" BOOLEAN NOT NULL DEFAULT false;
