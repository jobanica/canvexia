-- ============================================================================
-- Connection kit, product side (D37 Phase 2).
--
-- Additive only. Three new tables and three new nullable/defaulted columns on
-- restaurants:
--
--   restaurants."billingMode"      'gateway' for every existing row — their
--                                  billing is unchanged. New self-signups are
--                                  written 'manual' (QR + receipt).
--   restaurants."activationPaidAt" set by the portal's payment.confirmed
--   restaurants."contractSignedAt" set by the portal's contract.signed
--
--   product_event_outbox   events queued for the agent portal
--   product_callback_inbox callbacks received from it (idempotency)
--   servd_manual_payments  Servd's mirror of each receipt it reported
--
-- Generated with `prisma migrate diff` from the schema. Run once, then
-- `pnpm db:rls`: servd_manual_payments carries "restaurantId" and is picked up
-- by the tenant loop; the outbox and inbox are locked to the system by the
-- backstop sweep.
-- ============================================================================

BEGIN;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "activationPaidAt" TIMESTAMP(3),
ADD COLUMN     "billingMode" TEXT NOT NULL DEFAULT 'gateway',
ADD COLUMN     "contractSignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_event_outbox" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "portalStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "product_event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_callback_inbox" (
    "eventId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,

    CONSTRAINT "product_callback_inbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "servd_manual_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monthsCovered" INTEGER NOT NULL DEFAULT 1,
    "billingMonthStart" DATE,
    "amount" INTEGER NOT NULL,
    "bankReference" TEXT NOT NULL,
    "receiptPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reason" TEXT,
    "eventId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "servd_manual_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_event_outbox_eventId_key" ON "product_event_outbox"("eventId");

-- CreateIndex
CREATE INDEX "product_event_outbox_status_nextAttemptAt_idx" ON "product_event_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "servd_manual_payments_bankReference_key" ON "servd_manual_payments"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "servd_manual_payments_eventId_key" ON "servd_manual_payments"("eventId");

-- CreateIndex
CREATE INDEX "servd_manual_payments_restaurantId_submittedAt_idx" ON "servd_manual_payments"("restaurantId", "submittedAt");

-- AddForeignKey
ALTER TABLE "servd_manual_payments" ADD CONSTRAINT "servd_manual_payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
