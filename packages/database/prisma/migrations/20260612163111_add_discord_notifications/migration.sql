-- CreateTable
CREATE TABLE "discord_notification_preferences" (
    "id" TEXT NOT NULL,
    "discord_user_id" VARCHAR(32) NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "armed" BOOLEAN NOT NULL DEFAULT true,
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_notification_events" (
    "id" TEXT NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "discord_user_id" VARCHAR(32),
    "type" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedup_key" VARCHAR(128),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "discord_notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discord_notification_preferences_type_enabled_idx" ON "discord_notification_preferences"("type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "discord_notification_preferences_discord_guild_id_discord_u_key" ON "discord_notification_preferences"("discord_guild_id", "discord_user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "discord_notification_events_dedup_key_key" ON "discord_notification_events"("dedup_key");

-- CreateIndex
CREATE INDEX "discord_notification_events_delivered_at_created_at_idx" ON "discord_notification_events"("delivered_at", "created_at");
