-- Store refresh-token verifiers as SHA-256 hashes only.
-- Existing plaintext refresh-token rows are revoked during this migration so no
-- replayable bearer token survives the rollout.
DELETE FROM "refresh_tokens";

DROP INDEX IF EXISTS "refresh_tokens_token_key";

ALTER TABLE "refresh_tokens"
RENAME COLUMN "token" TO "token_hash";

ALTER TABLE "refresh_tokens"
ALTER COLUMN "token_hash" TYPE VARCHAR(64);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
