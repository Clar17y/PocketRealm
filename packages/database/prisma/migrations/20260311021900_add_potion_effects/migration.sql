-- Data migration: update existing placeholder potion templates with their effects
-- These UPDATEs are safe to run on empty databases (WHERE conditions won't match)

DO $$
BEGIN
  UPDATE "ItemTemplate"
  SET "consumableEffect" = '{"type": "cleanse_magic_dot", "value": 0}'::jsonb
  WHERE name = 'Antivenom Potion' AND "consumableEffect" IS NULL;

  UPDATE "ItemTemplate"
  SET "consumableEffect" = '{"type": "buff_defence", "value": 15, "duration": 5}'::jsonb
  WHERE name = 'Resist Potion' AND "consumableEffect" IS NULL;

  UPDATE "ItemTemplate"
  SET "consumableEffect" = '{"type": "buff_attack", "value": 0.25, "duration": 5}'::jsonb
  WHERE name = 'Elixir of Power' AND "consumableEffect" IS NULL;
END $$;
