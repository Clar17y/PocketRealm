-- CreateTable
CREATE TABLE "player_expedition_bestiary" (
    "player_id" TEXT NOT NULL,
    "mob_template_id" VARCHAR(64) NOT NULL,
    "theme" VARCHAR(32) NOT NULL,
    "kill_count" INTEGER NOT NULL DEFAULT 0,
    "first_encountered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_expedition_bestiary_pkey" PRIMARY KEY ("player_id","mob_template_id")
);

-- AddForeignKey
ALTER TABLE "player_expedition_bestiary" ADD CONSTRAINT "player_expedition_bestiary_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
