-- AlterTable
ALTER TABLE "items" ADD COLUMN     "is_soulbound" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "expedition_tokens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "guild_expeditions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'recruiting',
    "current_room" INTEGER NOT NULL DEFAULT 0,
    "total_rooms" INTEGER NOT NULL,
    "room_definitions" JSONB NOT NULL,
    "room_start_snapshot" JSONB,
    "round_number" INTEGER NOT NULL DEFAULT 0,
    "round_summaries" JSONB,
    "next_round_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "launched_by" TEXT NOT NULL,

    CONSTRAINT "guild_expeditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_expedition_members" (
    "id" TEXT NOT NULL,
    "expedition_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "current_hp" INTEGER NOT NULL,
    "current_stamina" INTEGER NOT NULL,
    "current_mana" INTEGER NOT NULL,
    "template_round" INTEGER NOT NULL DEFAULT 1,
    "active_effects" JSONB NOT NULL DEFAULT '[]',
    "threat_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_knocked_out" BOOLEAN NOT NULL DEFAULT false,
    "total_damage" BIGINT NOT NULL DEFAULT 0,
    "total_healing" BIGINT NOT NULL DEFAULT 0,
    "room_damage" BIGINT NOT NULL DEFAULT 0,
    "room_healing" BIGINT NOT NULL DEFAULT 0,
    "signed_up_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_expedition_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_expeditions_guild_id_status_idx" ON "guild_expeditions"("guild_id", "status");

-- CreateIndex
CREATE INDEX "guild_expeditions_guild_id_tier_started_at_idx" ON "guild_expeditions"("guild_id", "tier", "started_at");

-- CreateIndex
CREATE INDEX "guild_expeditions_status_next_round_at_idx" ON "guild_expeditions"("status", "next_round_at");

-- CreateIndex
CREATE UNIQUE INDEX "guild_expedition_members_expedition_id_player_id_key" ON "guild_expedition_members"("expedition_id", "player_id");

-- AddForeignKey
ALTER TABLE "guild_expeditions" ADD CONSTRAINT "guild_expeditions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_expeditions" ADD CONSTRAINT "guild_expeditions_launched_by_fkey" FOREIGN KEY ("launched_by") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_expedition_members" ADD CONSTRAINT "guild_expedition_members_expedition_id_fkey" FOREIGN KEY ("expedition_id") REFERENCES "guild_expeditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_expedition_members" ADD CONSTRAINT "guild_expedition_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
