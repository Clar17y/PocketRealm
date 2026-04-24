-- CreateTable
CREATE TABLE "chat_activities" (
    "id" TEXT NOT NULL,
    "chat_message_id" TEXT,
    "event_type" VARCHAR(32) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "zone_id" TEXT,
    "actor_player_id" TEXT,
    "actor_username" VARCHAR(32),
    "subject_name" VARCHAR(96),
    "subject_rarity" VARCHAR(16),
    "message" VARCHAR(200) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_npc_activity_reactions" (
    "player_id" TEXT NOT NULL,
    "npc_key" VARCHAR(64) NOT NULL,
    "activity_id" TEXT NOT NULL,
    "reacted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_npc_activity_reactions_pkey" PRIMARY KEY ("player_id","npc_key","activity_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_activities_chat_message_id_key" ON "chat_activities"("chat_message_id");

-- CreateIndex
CREATE INDEX "chat_activities_scope_created_at_idx" ON "chat_activities"("scope", "created_at");

-- CreateIndex
CREATE INDEX "chat_activities_zone_id_created_at_idx" ON "chat_activities"("zone_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_activities_event_type_created_at_idx" ON "chat_activities"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "player_npc_activity_reactions_player_id_npc_key_reacted_at_idx" ON "player_npc_activity_reactions"("player_id", "npc_key", "reacted_at");
