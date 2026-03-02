-- AlterTable
ALTER TABLE "players" ADD COLUMN     "gold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "roulette_rounds" (
    "id" TEXT NOT NULL,
    "spin_number" SERIAL NOT NULL,
    "result" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "roulette_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roulette_bets" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "bet_type" VARCHAR(16) NOT NULL,
    "bet_value" VARCHAR(32) NOT NULL,
    "amount" INTEGER NOT NULL,
    "payout" INTEGER,

    CONSTRAINT "roulette_bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roulette_bets_round_id_idx" ON "roulette_bets"("round_id");

-- CreateIndex
CREATE INDEX "roulette_bets_player_id_idx" ON "roulette_bets"("player_id");

-- AddForeignKey
ALTER TABLE "roulette_bets" ADD CONSTRAINT "roulette_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "roulette_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roulette_bets" ADD CONSTRAINT "roulette_bets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
