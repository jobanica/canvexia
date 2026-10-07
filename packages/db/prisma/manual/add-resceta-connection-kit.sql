-- ============================================================================
-- Resceta on the agent-portal connection kit (D37 Phase 5).
--
-- Additive: two nullable columns on pharmacies and resceta_manual_payments.
-- Run once, then `pnpm db:rls` — the new table carries "pharmacyId" and is
-- isolated by the tenant loop.
-- ============================================================================

BEGIN;

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "activationPaidAt" TIMESTAMP(3),
ADD COLUMN     "contractSignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "resceta_manual_payments" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
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

    CONSTRAINT "resceta_manual_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resceta_manual_payments_bankReference_key" ON "resceta_manual_payments"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "resceta_manual_payments_eventId_key" ON "resceta_manual_payments"("eventId");

-- CreateIndex
CREATE INDEX "resceta_manual_payments_pharmacyId_submittedAt_idx" ON "resceta_manual_payments"("pharmacyId", "submittedAt");

-- AddForeignKey
ALTER TABLE "resceta_manual_payments" ADD CONSTRAINT "resceta_manual_payments_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
