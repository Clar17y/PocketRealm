-- Fix materials JSON key: rename "itemTemplateId" → "templateId" in all crafting recipes.
-- The seed script transforms this key, but the SQL migration inserted the raw key name.
UPDATE crafting_recipes
SET materials = (
  SELECT json_agg(
    json_build_object('templateId', elem->>'itemTemplateId', 'quantity', (elem->>'quantity')::int)
  )
  FROM json_array_elements(materials::json) AS elem
)
WHERE materials::text LIKE '%itemTemplateId%';
