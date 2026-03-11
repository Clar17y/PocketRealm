-- Data migration: update existing placeholder potion templates with their effects
-- These UPDATEs are safe to run on empty databases (WHERE conditions won't match)
-- Values must match BUFF_POTION_CONSTANTS in gameConstants.ts

UPDATE "item_templates"
SET name = 'Cleansing Potion',
    "consumable_effect" = '{"type": "cleanse_magic_dot", "value": 1}'::jsonb
WHERE name = 'Antivenom Potion' AND "consumable_effect" IS NULL;

UPDATE "item_templates"
SET "consumable_effect" = '{"type": "buff_defence", "value": 15, "duration": 5}'::jsonb
WHERE name = 'Resist Potion' AND "consumable_effect" IS NULL;

UPDATE "item_templates"
SET "consumable_effect" = '{"type": "buff_attack", "value": 0.25, "duration": 5}'::jsonb
WHERE name = 'Elixir of Power' AND "consumable_effect" IS NULL;
