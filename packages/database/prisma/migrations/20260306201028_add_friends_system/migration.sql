-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_mails" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "subject" VARCHAR(100) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "gold_cost" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted_by_sender" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted_by_recipient" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_mails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friendships_receiver_id_status_idx" ON "friendships"("receiver_id", "status");

-- CreateIndex
CREATE INDEX "friendships_sender_id_status_idx" ON "friendships"("sender_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_sender_id_receiver_id_key" ON "friendships"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "player_blocks_blocker_id_idx" ON "player_blocks"("blocker_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_blocks_blocker_id_blocked_id_key" ON "player_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "friend_mails_recipient_id_is_deleted_by_recipient_is_read_idx" ON "friend_mails"("recipient_id", "is_deleted_by_recipient", "is_read");

-- CreateIndex
CREATE INDEX "friend_mails_sender_id_is_deleted_by_sender_idx" ON "friend_mails"("sender_id", "is_deleted_by_sender");

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_mails" ADD CONSTRAINT "friend_mails_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_mails" ADD CONSTRAINT "friend_mails_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
