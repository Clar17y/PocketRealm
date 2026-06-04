-- CreateTable
CREATE TABLE "discord_account_links" (
    "id" TEXT NOT NULL,
    "discord_user_id" VARCHAR(32) NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "account_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMP(3),
    "role_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_account_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_link_codes" (
    "id" TEXT NOT NULL,
    "discord_user_id" VARCHAR(32) NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_community_profiles" (
    "id" TEXT NOT NULL,
    "discord_user_id" VARCHAR(32) NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "daily_xp" INTEGER NOT NULL DEFAULT 0,
    "daily_xp_date" DATE,
    "last_xp_granted_at" TIMESTAMP(3),
    "last_role_sync_at" TIMESTAMP(3),
    "excluded_from_xp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_community_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_xp_events" (
    "id" TEXT NOT NULL,
    "discord_user_id" VARCHAR(32) NOT NULL,
    "discord_guild_id" VARCHAR(32) NOT NULL,
    "channel_id" VARCHAR(32) NOT NULL,
    "message_id" VARCHAR(32) NOT NULL,
    "message_fingerprint" VARCHAR(64) NOT NULL,
    "xp" INTEGER NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_duels" (
    "id" TEXT NOT NULL,
    "guild_id" VARCHAR(32) NOT NULL,
    "channel_id" VARCHAR(32) NOT NULL,
    "message_id" VARCHAR(32),
    "thread_id" VARCHAR(32),
    "challenger_discord_user_id" VARCHAR(32) NOT NULL,
    "target_discord_user_id" VARCHAR(32) NOT NULL,
    "challenger_player_id" TEXT NOT NULL,
    "target_player_id" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "winner_player_id" TEXT,
    "is_draw" BOOLEAN NOT NULL DEFAULT false,
    "combat_log" JSONB,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_duels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_discord_threads" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "guild_id" VARCHAR(32) NOT NULL,
    "triage_channel_id" VARCHAR(32) NOT NULL,
    "triage_message_id" VARCHAR(32) NOT NULL,
    "thread_id" VARCHAR(32),
    "reporter_discord_user_id" VARCHAR(32),
    "created_by_discord_user_id" VARCHAR(32),
    "status" VARCHAR(24) NOT NULL DEFAULT 'triage_posted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "support_ticket_discord_threads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_tickets" ADD COLUMN "discord_reporter_guild_id" VARCHAR(32);
ALTER TABLE "support_tickets" ADD COLUMN "discord_reporter_user_id" VARCHAR(32);

-- CreateTable
CREATE TABLE "discord_bot_audit_events" (
    "id" TEXT NOT NULL,
    "guild_id" VARCHAR(32) NOT NULL,
    "actor_discord_user_id" VARCHAR(32),
    "target_discord_user_id" VARCHAR(32),
    "command" VARCHAR(80) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "error_code" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_bot_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discord_account_links_discord_guild_id_discord_user_id_idx" ON "discord_account_links"("discord_guild_id", "discord_user_id");

-- CreateIndex
CREATE INDEX "discord_account_links_account_id_idx" ON "discord_account_links"("account_id");

-- CreateIndex
CREATE INDEX "discord_account_links_unlinked_at_role_synced_at_idx" ON "discord_account_links"("unlinked_at", "role_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "discord_link_codes_code_hash_key" ON "discord_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "discord_link_codes_discord_guild_id_discord_user_id_expires_idx" ON "discord_link_codes"("discord_guild_id", "discord_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "discord_community_profiles_discord_guild_id_level_idx" ON "discord_community_profiles"("discord_guild_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "discord_community_profiles_discord_guild_id_discord_user_id_key" ON "discord_community_profiles"("discord_guild_id", "discord_user_id");

-- CreateIndex
CREATE INDEX "discord_xp_events_discord_guild_id_discord_user_id_created__idx" ON "discord_xp_events"("discord_guild_id", "discord_user_id", "created_at");

-- CreateIndex
CREATE INDEX "discord_xp_events_message_fingerprint_created_at_idx" ON "discord_xp_events"("message_fingerprint", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "discord_xp_events_discord_guild_id_message_id_key" ON "discord_xp_events"("discord_guild_id", "message_id");

-- CreateIndex
CREATE INDEX "discord_duels_guild_id_channel_id_created_at_idx" ON "discord_duels"("guild_id", "channel_id", "created_at");

-- CreateIndex
CREATE INDEX "discord_duels_status_expires_at_idx" ON "discord_duels"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_discord_threads_ticket_id_key" ON "support_ticket_discord_threads"("ticket_id");

-- CreateIndex
CREATE INDEX "support_ticket_discord_threads_guild_id_triage_channel_id_idx" ON "support_ticket_discord_threads"("guild_id", "triage_channel_id");

-- CreateIndex
CREATE INDEX "support_ticket_discord_threads_thread_id_idx" ON "support_ticket_discord_threads"("thread_id");

-- CreateIndex
CREATE INDEX "support_tickets_discord_reporter_guild_id_discord_reporter_user_id_idx" ON "support_tickets"("discord_reporter_guild_id", "discord_reporter_user_id");

-- CreateIndex
CREATE INDEX "discord_bot_audit_events_guild_id_created_at_idx" ON "discord_bot_audit_events"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "discord_bot_audit_events_actor_discord_user_id_created_at_idx" ON "discord_bot_audit_events"("actor_discord_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "discord_account_links" ADD CONSTRAINT "discord_account_links_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_duels" ADD CONSTRAINT "discord_duels_challenger_player_id_fkey" FOREIGN KEY ("challenger_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_duels" ADD CONSTRAINT "discord_duels_target_player_id_fkey" FOREIGN KEY ("target_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_duels" ADD CONSTRAINT "discord_duels_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_discord_threads" ADD CONSTRAINT "support_ticket_discord_threads_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "discord_account_links_active_discord_unique"
ON "discord_account_links"("discord_guild_id", "discord_user_id")
WHERE "unlinked_at" IS NULL;

CREATE UNIQUE INDEX "discord_account_links_active_account_unique"
ON "discord_account_links"("account_id")
WHERE "unlinked_at" IS NULL;
