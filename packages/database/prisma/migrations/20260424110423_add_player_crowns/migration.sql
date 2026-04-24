-- CreateTable
CREATE TABLE "player_crowns" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "realm_id" VARCHAR(128) NOT NULL DEFAULT 'permanent',
    "rank" INTEGER NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_crowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_crowns_player_id_idx" ON "player_crowns"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_crowns_player_id_category_week_start_realm_id_key" ON "player_crowns"("player_id", "category", "week_start", "realm_id");

-- AddForeignKey
ALTER TABLE "player_crowns" ADD CONSTRAINT "player_crowns_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
