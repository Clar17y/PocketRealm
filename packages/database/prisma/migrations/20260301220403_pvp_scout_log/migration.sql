-- CreateTable
CREATE TABLE "pvp_scout_logs" (
    "id" TEXT NOT NULL,
    "scouter_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_scout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pvp_scout_logs_target_id_is_read_idx" ON "pvp_scout_logs"("target_id", "is_read");

-- AddForeignKey
ALTER TABLE "pvp_scout_logs" ADD CONSTRAINT "pvp_scout_logs_scouter_id_fkey" FOREIGN KEY ("scouter_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_scout_logs" ADD CONSTRAINT "pvp_scout_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
