-- ============================================================================
-- Agent portal, Phase 3 (D37): the portal → product callback outbox.
-- Additive. Run once, then `pnpm db:rls` (the policies are in rls.sql).
-- ============================================================================

BEGIN;

-- CreateTable
CREATE TABLE "agent_callback_outbox" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "agent_callback_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_callback_outbox_eventId_key" ON "agent_callback_outbox"("eventId");

-- CreateIndex
CREATE INDEX "agent_callback_outbox_status_nextAttemptAt_idx" ON "agent_callback_outbox"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "agent_callback_outbox" ADD CONSTRAINT "agent_callback_outbox_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
