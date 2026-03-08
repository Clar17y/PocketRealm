-- CreateTable
CREATE TABLE "shop_items" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "cost" INTEGER NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "weekly_limit" INTEGER,
    "lifetime_limit" INTEGER,
    "buff_type" VARCHAR(32),
    "buff_value" DOUBLE PRECISION,
    "buff_uses" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_shop_purchases" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "shop_item_id" TEXT NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_buffs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "buff_type" VARCHAR(32) NOT NULL,
    "remaining_uses" INTEGER NOT NULL,
    "bonus_value" DOUBLE PRECISION NOT NULL,
    "shop_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_buffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_items_key_key" ON "shop_items"("key");

-- CreateIndex
CREATE INDEX "player_shop_purchases_player_id_shop_item_id_purchased_at_idx" ON "player_shop_purchases"("player_id", "shop_item_id", "purchased_at");

-- CreateIndex
CREATE UNIQUE INDEX "player_buffs_player_id_buff_type_key" ON "player_buffs"("player_id", "buff_type");

-- AddForeignKey
ALTER TABLE "player_shop_purchases" ADD CONSTRAINT "player_shop_purchases_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_shop_purchases" ADD CONSTRAINT "player_shop_purchases_shop_item_id_fkey" FOREIGN KEY ("shop_item_id") REFERENCES "shop_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_buffs" ADD CONSTRAINT "player_buffs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_buffs" ADD CONSTRAINT "player_buffs_shop_item_id_fkey" FOREIGN KEY ("shop_item_id") REFERENCES "shop_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
