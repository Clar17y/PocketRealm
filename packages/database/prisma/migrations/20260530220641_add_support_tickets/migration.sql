-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "source" VARCHAR(24) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'new',
    "privacy" VARCHAR(24) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "area" VARCHAR(32) NOT NULL,
    "sensitivity_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "expected_behavior" VARCHAR(2000),
    "actual_behavior" VARCHAR(2000),
    "reproduction_steps" VARCHAR(3000),
    "reporter_account_id" TEXT NOT NULL,
    "reporter_player_id" TEXT NOT NULL,
    "reporter_display_name" VARCHAR(64) NOT NULL,
    "realm_label" VARCHAR(80) NOT NULL,
    "screen" VARCHAR(80),
    "app_version" VARCHAR(80),
    "api_version" VARCHAR(80),
    "browser" VARCHAR(160),
    "device" VARCHAR(160),
    "request_id" VARCHAR(64),
    "sentry_event_id" VARCHAR(64),
    "attachment_metadata" JSONB,
    "duplicate_ticket_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "github_issue_url" VARCHAR(500),
    "staff_notes" VARCHAR(4000),
    "discord_message_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "actor_account_id" TEXT,
    "event_type" VARCHAR(32) NOT NULL,
    "from_status" VARCHAR(24),
    "to_status" VARCHAR(24),
    "note" VARCHAR(2000),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_public_id_key" ON "support_tickets"("public_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_reporter_account_id_created_at_idx" ON "support_tickets"("reporter_account_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_reporter_player_id_created_at_idx" ON "support_tickets"("reporter_player_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_category_area_idx" ON "support_tickets"("category", "area");

-- CreateIndex
CREATE INDEX "support_ticket_events_ticket_id_created_at_idx" ON "support_ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "support_ticket_events_actor_account_id_created_at_idx" ON "support_ticket_events"("actor_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reporter_account_id_fkey" FOREIGN KEY ("reporter_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reporter_player_id_fkey" FOREIGN KEY ("reporter_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
