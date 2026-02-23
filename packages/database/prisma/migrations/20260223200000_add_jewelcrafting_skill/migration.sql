-- Add jewelcrafting skill to all existing players who don't have it
INSERT INTO player_skills (id, player_id, skill_type, level, xp, daily_xp_gained, last_xp_reset_at)
SELECT
  gen_random_uuid(),
  p.id,
  'jewelcrafting',
  1,
  0,
  0,
  NOW()
FROM players p
WHERE NOT EXISTS (
  SELECT 1 FROM player_skills ps
  WHERE ps.player_id = p.id AND ps.skill_type = 'jewelcrafting'
);
