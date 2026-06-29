-- Add optional zone-specific chest drop tables. Null zone_id rows remain the
-- family-wide fallback tables.
ALTER TABLE "chest_drop_tables" ADD COLUMN "zone_id" TEXT;

ALTER TABLE "chest_drop_tables"
  ADD CONSTRAINT "chest_drop_tables_zone_id_fkey"
  FOREIGN KEY ("zone_id")
  REFERENCES "zones"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "chest_drop_tables_mob_family_id_zone_id_chest_rarity_idx"
  ON "chest_drop_tables"("mob_family_id", "zone_id", "chest_rarity");
