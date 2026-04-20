-- CreateTable
CREATE TABLE "premium_purchases" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_session_id" TEXT,
    "provider_payment_intent_id" TEXT,
    "product_type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "champion_days_granted" INTEGER NOT NULL,
    "granted_from" TIMESTAMP(3) NOT NULL,
    "granted_until" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premium_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "premium_purchases_provider_session_id_key" ON "premium_purchases"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "premium_purchases_provider_payment_intent_id_key" ON "premium_purchases"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "premium_purchases_player_id_created_at_idx" ON "premium_purchases"("player_id", "created_at");

-- AddForeignKey
ALTER TABLE "premium_purchases" ADD CONSTRAINT "premium_purchases_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
