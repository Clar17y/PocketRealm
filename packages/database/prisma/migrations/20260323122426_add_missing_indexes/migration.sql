-- CreateIndex
CREATE INDEX "guild_expedition_members_player_id_idx" ON "guild_expedition_members"("player_id");

-- CreateIndex
CREATE INDEX "items_owner_id_in_stash_idx" ON "items"("owner_id", "in_stash");

-- CreateIndex
CREATE INDEX "mob_templates_zone_id_idx" ON "mob_templates"("zone_id");

-- CreateIndex
CREATE INDEX "mob_templates_is_boss_idx" ON "mob_templates"("is_boss");

-- CreateIndex
CREATE INDEX "players_current_zone_id_idx" ON "players"("current_zone_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_player_id_idx" ON "refresh_tokens"("player_id");

-- CreateIndex
CREATE INDEX "resource_nodes_zone_id_idx" ON "resource_nodes"("zone_id");

-- CreateIndex
CREATE INDEX "roulette_rounds_resolved_at_idx" ON "roulette_rounds"("resolved_at");
