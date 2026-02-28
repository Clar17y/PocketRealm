-- AlterTable
ALTER TABLE "players" ADD COLUMN     "current_mana" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "current_stamina" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "last_mana_regen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_stamina_regen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "combat_templates" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "actions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combat_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_point_allocations" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "allocations" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_point_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "combat_templates_player_id_is_active_idx" ON "combat_templates"("player_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "skill_point_allocations_player_id_key" ON "skill_point_allocations"("player_id");

-- AddForeignKey
ALTER TABLE "combat_templates" ADD CONSTRAINT "combat_templates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_point_allocations" ADD CONSTRAINT "skill_point_allocations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
