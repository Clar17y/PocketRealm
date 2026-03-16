-- CreateIndex
CREATE INDEX "boss_participants_player_id_idx" ON "boss_participants"("player_id");

-- CreateIndex
CREATE INDEX "drop_tables_mob_template_id_idx" ON "drop_tables"("mob_template_id");

-- CreateIndex
CREATE INDEX "guild_upgrades_guild_id_expires_at_idx" ON "guild_upgrades"("guild_id", "expires_at");

-- CreateIndex
CREATE INDEX "guilds_level_idx" ON "guilds"("level");

-- CreateIndex
CREATE INDEX "items_owner_id_template_id_in_stash_idx" ON "items"("owner_id", "template_id", "in_stash");

-- CreateIndex
CREATE INDEX "mob_templates_is_expedition_mob_idx" ON "mob_templates"("is_expedition_mob");

-- CreateIndex
CREATE INDEX "pvp_cooldowns_attacker_id_expires_at_idx" ON "pvp_cooldowns"("attacker_id", "expires_at");

-- CreateIndex
CREATE INDEX "pvp_matches_defender_id_defender_read_idx" ON "pvp_matches"("defender_id", "defender_read");

-- CreateIndex
CREATE INDEX "pvp_ratings_rating_idx" ON "pvp_ratings"("rating");

-- AddForeignKey
ALTER TABLE "pvp_cooldowns" ADD CONSTRAINT "pvp_cooldowns_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_cooldowns" ADD CONSTRAINT "pvp_cooldowns_defender_id_fkey" FOREIGN KEY ("defender_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
