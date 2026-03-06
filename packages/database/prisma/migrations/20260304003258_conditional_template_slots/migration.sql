-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('resource_below', 'resource_above', 'has_buff', 'has_debuff', 'no_buff', 'no_debuff');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('hp', 'stamina', 'mana');

-- CreateTable
CREATE TABLE "combat_template_slots" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "action_id" TEXT NOT NULL,
    "condition_type" "ConditionType",
    "resource" "ResourceType",
    "threshold" INTEGER,
    "effect_name" TEXT,
    "then_action_id" TEXT,

    CONSTRAINT "combat_template_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "combat_template_slots_template_id_sort_order_idx" ON "combat_template_slots"("template_id", "sort_order");

-- AddForeignKey
ALTER TABLE "combat_template_slots" ADD CONSTRAINT "combat_template_slots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "combat_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate data: convert JSON actions to relational slots
INSERT INTO "combat_template_slots" ("id", "template_id", "sort_order", "action_id")
SELECT
    gen_random_uuid(),
    ct.id,
    (elem.ordinality - 1)::integer,
    elem.value->>'actionId'
FROM "combat_templates" ct,
LATERAL jsonb_array_elements(ct.actions::jsonb) WITH ORDINALITY AS elem(value, ordinality);

-- AlterTable
ALTER TABLE "combat_templates" DROP COLUMN "actions";
