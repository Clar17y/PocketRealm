-- CreateTable
CREATE TABLE "api_latency_snapshots" (
    "id" TEXT NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "bucket_size_seconds" INTEGER NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "request_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "client_error_count" INTEGER NOT NULL,
    "server_error_count" INTEGER NOT NULL,
    "avg_ms" DOUBLE PRECISION NOT NULL,
    "min_ms" INTEGER NOT NULL,
    "max_ms" INTEGER NOT NULL,
    "p50_ms" INTEGER NOT NULL,
    "p75_ms" INTEGER NOT NULL,
    "p90_ms" INTEGER NOT NULL,
    "p95_ms" INTEGER NOT NULL,
    "p99_ms" INTEGER NOT NULL,
    "duration_histogram" JSONB NOT NULL,
    "active_connections" INTEGER NOT NULL,
    "connected_players" INTEGER NOT NULL,
    "event_loop_lag_ms" DOUBLE PRECISION NOT NULL,
    "memory_usage_mb" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_latency_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_latency_snapshots_bucket_start_idx" ON "api_latency_snapshots"("bucket_start");

-- CreateIndex
CREATE INDEX "api_latency_snapshots_action_bucket_start_idx" ON "api_latency_snapshots"("action", "bucket_start");

-- CreateIndex
CREATE UNIQUE INDEX "api_latency_snapshots_bucket_start_bucket_size_seconds_acti_key" ON "api_latency_snapshots"("bucket_start", "bucket_size_seconds", "action", "method", "route");
