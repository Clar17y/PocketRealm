-- CreateTable
CREATE TABLE "guild_join_requests" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_join_requests_guild_id_status_idx" ON "guild_join_requests"("guild_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guild_join_requests_guild_id_player_id_key" ON "guild_join_requests"("guild_id", "player_id");

-- AddForeignKey
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
