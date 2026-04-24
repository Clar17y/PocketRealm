-- CreateIndex
CREATE INDEX "chat_activities_expires_at_idx" ON "chat_activities"("expires_at");

-- AddForeignKey
ALTER TABLE "chat_activities" ADD CONSTRAINT "chat_activities_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_npc_activity_reactions" ADD CONSTRAINT "player_npc_activity_reactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_npc_activity_reactions" ADD CONSTRAINT "player_npc_activity_reactions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "chat_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
