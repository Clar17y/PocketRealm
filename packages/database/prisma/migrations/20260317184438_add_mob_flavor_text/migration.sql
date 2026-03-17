-- AlterTable
ALTER TABLE "mob_families" ADD COLUMN     "flavor_overview" TEXT;

-- AlterTable
ALTER TABLE "mob_templates" ADD COLUMN     "flavor_appearance" TEXT,
ADD COLUMN     "flavor_behavior" TEXT,
ADD COLUMN     "flavor_lore" TEXT;
