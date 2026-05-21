-- AlterTable
ALTER TABLE "items" ADD COLUMN "craft_marks" JSONB;

-- AlterTable
ALTER TABLE "crafting_recipes" ADD COLUMN "vocation_id" VARCHAR(32);

-- CreateTable
CREATE TABLE "player_vocations" (
    "player_id" TEXT NOT NULL,
    "vocation_id" VARCHAR(32) NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "mastery_points" INTEGER NOT NULL DEFAULT 0,
    "spent_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_vocations_pkey" PRIMARY KEY ("player_id", "vocation_id")
);

-- CreateTable
CREATE TABLE "player_vocation_techniques" (
    "player_id" TEXT NOT NULL,
    "vocation_id" VARCHAR(32) NOT NULL,
    "technique_id" VARCHAR(96) NOT NULL,
    "learned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_vocation_techniques_pkey" PRIMARY KEY ("player_id", "vocation_id", "technique_id")
);

-- CreateTable
CREATE TABLE "player_vocation_daily_caps" (
    "player_id" TEXT NOT NULL,
    "day_start" TIMESTAMP(3) NOT NULL,
    "turns_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_vocation_daily_caps_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_vocation_counters" (
    "player_id" TEXT NOT NULL,
    "stat_key" VARCHAR(128) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_vocation_counters_pkey" PRIMARY KEY ("player_id", "stat_key")
);

-- CreateIndex
CREATE INDEX "crafting_recipes_vocation_id_idx" ON "crafting_recipes"("vocation_id");

-- AddForeignKey
ALTER TABLE "player_vocations" ADD CONSTRAINT "player_vocations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_vocation_techniques" ADD CONSTRAINT "player_vocation_techniques_player_id_vocation_id_fkey" FOREIGN KEY ("player_id", "vocation_id") REFERENCES "player_vocations"("player_id", "vocation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_vocation_daily_caps" ADD CONSTRAINT "player_vocation_daily_caps_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_vocation_counters" ADD CONSTRAINT "player_vocation_counters_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
