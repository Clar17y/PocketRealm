-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "tag" VARCHAR(4) NOT NULL,
    "description" VARCHAR(200),
    "leader_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "recruitment_mode" VARCHAR(16) NOT NULL DEFAULT 'invite_only',
    "min_level_requirement" INTEGER NOT NULL DEFAULT 0,
    "tax_rate" INTEGER NOT NULL DEFAULT 5,
    "specialization" VARCHAR(16),
    "renown" INTEGER NOT NULL DEFAULT 0,
    "seasonal_renown" INTEGER NOT NULL DEFAULT 0,
    "treasury_turns" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "guild_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_turns_contributed" INTEGER NOT NULL DEFAULT 0,
    "weekly_turns_contributed" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("guild_id","player_id")
);

-- CreateTable
CREATE TABLE "guild_upgrades" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "upgrade_type" VARCHAR(32) NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "activated_by" TEXT NOT NULL,

    CONSTRAINT "guild_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_projects" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "project_key" VARCHAR(64) NOT NULL,
    "turns_contributed" INTEGER NOT NULL DEFAULT 0,
    "materials_progress" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "guild_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_project_contributions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "turns_contributed" INTEGER NOT NULL DEFAULT 0,
    "materials_contributed" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "guild_project_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_contracts" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "contract_key" VARCHAR(64) NOT NULL,
    "target_value" INTEGER NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "week_started_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_logs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "event_type" VARCHAR(32) NOT NULL,
    "message" VARCHAR(200) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guilds_name_key" ON "guilds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_tag_key" ON "guilds"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_player_id_key" ON "guild_members"("player_id");

-- CreateIndex
CREATE INDEX "guild_upgrades_guild_id_upgrade_type_expires_at_idx" ON "guild_upgrades"("guild_id", "upgrade_type", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "guild_projects_guild_id_project_key_key" ON "guild_projects"("guild_id", "project_key");

-- CreateIndex
CREATE UNIQUE INDEX "guild_project_contributions_project_id_player_id_key" ON "guild_project_contributions"("project_id", "player_id");

-- CreateIndex
CREATE INDEX "guild_contracts_guild_id_status_idx" ON "guild_contracts"("guild_id", "status");

-- CreateIndex
CREATE INDEX "guild_logs_guild_id_created_at_idx" ON "guild_logs"("guild_id", "created_at");

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_upgrades" ADD CONSTRAINT "guild_upgrades_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_projects" ADD CONSTRAINT "guild_projects_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_project_contributions" ADD CONSTRAINT "guild_project_contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "guild_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_contracts" ADD CONSTRAINT "guild_contracts_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_logs" ADD CONSTRAINT "guild_logs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
