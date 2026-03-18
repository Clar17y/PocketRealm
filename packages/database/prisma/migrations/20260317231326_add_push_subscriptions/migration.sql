-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_subscriptions_player_id_idx" ON "push_subscriptions"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_player_id_endpoint_key" ON "push_subscriptions"("player_id", "endpoint");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
