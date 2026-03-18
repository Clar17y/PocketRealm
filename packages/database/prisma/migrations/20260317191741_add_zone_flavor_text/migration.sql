-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "ambient_texts" JSONB,
ADD COLUMN     "arrival_text" TEXT,
ADD COLUMN     "environmental_texts" JSONB;
