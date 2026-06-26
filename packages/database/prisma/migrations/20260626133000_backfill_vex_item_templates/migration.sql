-- Backfill Vex item template data for existing environments where seed data is not rerun.

UPDATE "item_templates"
SET
    "item_type" = 'weapon',
    "weight_class" = NULL,
    "slot" = 'main_hand',
    "tier" = 2,
    "base_stats" = '{"attack":13,"accuracy":4,"critChance":0.03}'::jsonb,
    "required_skill" = 'melee',
    "required_level" = 8,
    "max_durability" = 110,
    "stackable" = false,
    "consumable_effect" = NULL,
    "sell_price" = 0
WHERE "name" = 'Wolfsbane Blade';

UPDATE "item_templates"
SET
    "item_type" = 'armor',
    "weight_class" = 'medium',
    "slot" = 'chest',
    "tier" = 2,
    "base_stats" = '{"armor":7,"health":8,"dodge":3}'::jsonb,
    "required_skill" = NULL,
    "required_level" = 8,
    "max_durability" = 120,
    "stackable" = false,
    "consumable_effect" = NULL,
    "sell_price" = 0
WHERE "name" = 'Alpha Pelt Chest';

UPDATE "item_templates"
SET
    "item_type" = 'weapon',
    "weight_class" = NULL,
    "slot" = 'main_hand',
    "tier" = 4,
    "base_stats" = '{"magicPower":24,"accuracy":4,"critChance":0.04}'::jsonb,
    "required_skill" = 'magic',
    "required_level" = 16,
    "max_durability" = 130,
    "stackable" = false,
    "consumable_effect" = NULL,
    "sell_price" = 0
WHERE "name" = 'Spirit Staff';

UPDATE "item_templates"
SET
    "item_type" = 'armor',
    "weight_class" = 'light',
    "slot" = 'chest',
    "tier" = 4,
    "base_stats" = '{"magicDefence":12,"health":12,"dodge":4,"magicPower":3}'::jsonb,
    "required_skill" = NULL,
    "required_level" = 16,
    "max_durability" = 140,
    "stackable" = false,
    "consumable_effect" = NULL,
    "sell_price" = 0
WHERE "name" = 'Ethereal Robes';

INSERT INTO "item_templates" (
    "id",
    "name",
    "item_type",
    "weight_class",
    "slot",
    "tier",
    "base_stats",
    "required_skill",
    "required_level",
    "max_durability",
    "stackable",
    "consumable_effect",
    "sell_price"
)
SELECT
    'vex_wayfarer_aegis',
    'Wayfarer Aegis',
    'armor',
    'medium',
    'off_hand',
    2,
    '{"accuracy":10,"armor":4,"health":8}'::jsonb,
    NULL,
    8,
    100,
    false,
    NULL,
    0
WHERE NOT EXISTS (
    SELECT 1 FROM "item_templates"
    WHERE "name" = 'Wayfarer Aegis' AND "season_id" IS NULL
);

INSERT INTO "item_templates" (
    "id",
    "name",
    "item_type",
    "weight_class",
    "slot",
    "tier",
    "base_stats",
    "required_skill",
    "required_level",
    "max_durability",
    "stackable",
    "consumable_effect",
    "sell_price"
)
SELECT
    'vex_spiritbound_aegis',
    'Spiritbound Aegis',
    'armor',
    'medium',
    'off_hand',
    4,
    '{"accuracy":14,"magicDefence":8,"armor":5,"health":12}'::jsonb,
    NULL,
    16,
    140,
    false,
    NULL,
    0
WHERE NOT EXISTS (
    SELECT 1 FROM "item_templates"
    WHERE "name" = 'Spiritbound Aegis' AND "season_id" IS NULL
);

WITH "target_max" AS (
    SELECT * FROM (VALUES
        ('Wolfsbane Blade', 100, 110),
        ('Alpha Pelt Chest', 100, 120),
        ('Spirit Staff', 100, 130),
        ('Ethereal Robes', 120, 140)
    ) AS "values"("name", "old_max", "new_max")
),
"item_durability" AS (
    SELECT
        "item"."id",
        "item"."current_durability",
        "item"."max_durability",
        "target_max"."new_max",
        LEAST(
            "target_max"."new_max",
            COALESCE("item"."max_durability", "target_max"."old_max")
                + ("target_max"."new_max" - "target_max"."old_max")
        ) AS "backfilled_max"
    FROM "items" AS "item"
    JOIN "item_templates" AS "template" ON "template"."id" = "item"."template_id"
    JOIN "target_max" ON "target_max"."name" = "template"."name"
    WHERE "item"."max_durability" IS NULL OR "item"."max_durability" < "target_max"."new_max"
)
UPDATE "items" AS "item"
SET
    "current_durability" = CASE
        WHEN "item_durability"."current_durability" IS NULL THEN "item_durability"."backfilled_max"
        ELSE LEAST(
            "item_durability"."backfilled_max",
            "item_durability"."current_durability"
                + ("item_durability"."backfilled_max" - COALESCE("item_durability"."max_durability", 0))
        )
    END,
    "max_durability" = "item_durability"."backfilled_max"
FROM "item_durability"
WHERE "item"."id" = "item_durability"."id";
