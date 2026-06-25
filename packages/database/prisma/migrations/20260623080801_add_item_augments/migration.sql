-- CreateTable
CREATE TABLE "item_augments" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "augment_type" VARCHAR(64) NOT NULL,
    "source_key" VARCHAR(64) NOT NULL,
    "metadata" JSONB,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_augments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_augments_source_key_idx" ON "item_augments"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "item_augments_item_id_augment_type_key" ON "item_augments"("item_id", "augment_type");

-- AddForeignKey
ALTER TABLE "item_augments" ADD CONSTRAINT "item_augments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
