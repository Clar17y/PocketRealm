-- CreateTable
CREATE TABLE "player_quests" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "quest_key" VARCHAR(64) NOT NULL,
    "cadence" VARCHAR(8) NOT NULL,
    "target_value" INTEGER NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "reward_amount" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "filter_value" VARCHAR(64),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_quest_state" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "last_daily_reset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_weekly_reset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_bonus_claimed" BOOLEAN NOT NULL DEFAULT false,
    "quest_tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_quest_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_quests_player_id_status_idx" ON "player_quests"("player_id", "status");

-- CreateIndex
CREATE INDEX "player_quests_player_id_cadence_assigned_at_idx" ON "player_quests"("player_id", "cadence", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "player_quest_state_player_id_key" ON "player_quest_state"("player_id");

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_state" ADD CONSTRAINT "player_quest_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
