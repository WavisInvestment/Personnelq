/*
  Safe retries.

  - EmployeeInvitation.open_key / RetakeRequest.open_key: unique while a record is live (NULLs never collide), so the
    database itself refuses a second waiting invitation or a second live retake request for the same thing.
    Existing live rows are keyed here; if duplicates already exist only the newest keeps its key.
  - WebhookEvent: every payment-provider event, deduplicated by a hash of its body.
  - IdempotencyKey: caller-supplied keys and the first response, for replaying retried requests.
*/

-- AlterTable
ALTER TABLE "EmployeeInvitation" ADD COLUMN "open_key" TEXT;
ALTER TABLE "RetakeRequest" ADD COLUMN "open_key" TEXT;

-- Backfill: only the newest live row per key gets it
UPDATE "EmployeeInvitation" e SET "open_key" = e."organization_id" || ':' || lower(e."recipient_email")
WHERE e."status" = 'pending' AND e."id" = (
  SELECT x."id" FROM "EmployeeInvitation" x
  WHERE x."status" = 'pending' AND x."organization_id" = e."organization_id" AND lower(x."recipient_email") = lower(e."recipient_email")
  ORDER BY x."created_at" DESC, x."id" DESC LIMIT 1
);
UPDATE "RetakeRequest" r SET "open_key" = r."organization_id" || ':' || r."user_id" || ':' || r."assessment_id"
WHERE r."status" IN ('requested', 'approved') AND r."id" = (
  SELECT x."id" FROM "RetakeRequest" x
  WHERE x."status" IN ('requested', 'approved') AND x."organization_id" = r."organization_id" AND x."user_id" = r."user_id" AND x."assessment_id" = r."assessment_id"
  ORDER BY x."created_at" DESC, x."id" DESC LIMIT 1
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeInvitation_open_key_key" ON "EmployeeInvitation"("open_key");
CREATE UNIQUE INDEX "RetakeRequest_open_key_key" ON "RetakeRequest"("open_key");

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_provider_dedupe_key_key" ON "WebhookEvent"("provider", "dedupe_key");
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");
CREATE INDEX "WebhookEvent_reference_idx" ON "WebhookEvent"("reference");
CREATE INDEX "WebhookEvent_received_at_idx" ON "WebhookEvent"("received_at");

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'in_progress',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdempotencyKey_user_id_key_key" ON "IdempotencyKey"("user_id", "key");
CREATE INDEX "IdempotencyKey_expires_at_idx" ON "IdempotencyKey"("expires_at");
