-- Insert backpack item templates
INSERT INTO item_templates (id, name, item_type, slot, tier, base_stats, required_level, max_durability, stackable, sell_price)
VALUES
  (gen_random_uuid(), 'Cloth Satchel',                'armor', 'backpack', 1, '{"inventorySlots":8}',  1, 0, false, 15),
  (gen_random_uuid(), 'Reinforced Pack',              'armor', 'backpack', 2, '{"inventorySlots":16}', 1, 0, false, 30),
  (gen_random_uuid(), 'Traveller''s Rucksack',        'armor', 'backpack', 3, '{"inventorySlots":24}', 1, 0, false, 45),
  (gen_random_uuid(), 'Ranger''s Haversack',          'armor', 'backpack', 4, '{"inventorySlots":32}', 1, 0, false, 60),
  (gen_random_uuid(), 'Adventurer''s Expedition Pack', 'armor', 'backpack', 5, '{"inventorySlots":40}', 1, 0, false, 75)
ON CONFLICT DO NOTHING;

-- Insert backpack crafting recipes (tailoring skill, standard recipes)
-- Each recipe references result template + materials by name lookup
INSERT INTO crafting_recipes (id, skill_type, required_level, result_template_id, is_advanced, soulbound, turn_cost, materials, xp_reward)
VALUES
  -- T1: Cloth Satchel (tailoring 5) — 6x Silk Cloth + 3x Rat Leather
  (gen_random_uuid(), 'tailoring', 5,
    (SELECT id FROM item_templates WHERE name = 'Cloth Satchel'),
    false, false, 20,
    json_build_array(
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Silk Cloth'), 'quantity', 6),
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Rat Leather'), 'quantity', 3)
    ),
    25),

  -- T2: Reinforced Pack (tailoring 15) — 6x Woven Cloth + 4x Wolf Leather
  (gen_random_uuid(), 'tailoring', 15,
    (SELECT id FROM item_templates WHERE name = 'Reinforced Pack'),
    false, false, 35,
    json_build_array(
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Woven Cloth'), 'quantity', 6),
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Wolf Leather'), 'quantity', 4)
    ),
    45),

  -- T3: Traveller's Rucksack (tailoring 25) — 6x Fae Fabric + 4x Warg Leather
  (gen_random_uuid(), 'tailoring', 25,
    (SELECT id FROM item_templates WHERE name = 'Traveller''s Rucksack'),
    false, false, 55,
    json_build_array(
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Fae Fabric'), 'quantity', 6),
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Warg Leather'), 'quantity', 4)
    ),
    70),

  -- T4: Ranger's Haversack (tailoring 35) — 6x Cursed Fabric + 4x Croc Leather
  (gen_random_uuid(), 'tailoring', 35,
    (SELECT id FROM item_templates WHERE name = 'Ranger''s Haversack'),
    false, false, 80,
    json_build_array(
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Cursed Fabric'), 'quantity', 6),
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Croc Leather'), 'quantity', 4)
    ),
    100),

  -- T5: Adventurer's Expedition Pack (tailoring 45) — 6x Spectral Fabric + 4x Naga Leather
  (gen_random_uuid(), 'tailoring', 45,
    (SELECT id FROM item_templates WHERE name = 'Adventurer''s Expedition Pack'),
    false, false, 110,
    json_build_array(
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Spectral Fabric'), 'quantity', 6),
      json_build_object('templateId', (SELECT id FROM item_templates WHERE name = 'Naga Leather'), 'quantity', 4)
    ),
    140);
