-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN "season_id" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_season_id_created_at_idx" ON "support_tickets"("season_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
