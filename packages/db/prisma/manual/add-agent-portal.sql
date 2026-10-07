-- ============================================================================
-- Agent portal (D37) — the tables behind apps/agent-portal.
--
-- Additive only: fifteen new tables and eleven new enums, nothing existing is
-- altered. Generated with
--
--   prisma migrate diff --from-schema-datamodel <before> \
--     --to-schema-datamodel packages/db/prisma/schema.prisma --script
--
-- so it cannot disagree with the schema. A database built fresh from the
-- schema (D26) already has all of this and does not need it.
--
-- AFTER RUNNING IT, run `pnpm db:rls`. The policies, the ledger trigger and the
-- template-version index live in rls.sql, and until it runs the new tables are
-- reachable only as the connection owner — which is the wrong way round.
--
-- Not idempotent (Prisma emits bare CREATE TYPE / CREATE TABLE). Run it once.
-- ============================================================================

BEGIN;

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('pending', 'active', 'suspended', 'removed');

-- CreateEnum
CREATE TYPE "AgentProductStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "AgentReferralStatus" AS ENUM ('lead', 'active', 'churned');

-- CreateEnum
CREATE TYPE "AgentPaymentType" AS ENUM ('activation', 'monthly');

-- CreateEnum
CREATE TYPE "AgentPaymentStatus" AS ENUM ('submitted', 'confirmed', 'rejected', 'reversed');

-- CreateEnum
CREATE TYPE "AgentCommissionKind" AS ENUM ('activation', 'monthly', 'reversal');

-- CreateEnum
CREATE TYPE "AgentCommissionStatus" AS ENUM ('pending_release', 'approved', 'paid', 'reversed');

-- CreateEnum
CREATE TYPE "AgentPayoutStatus" AS ENUM ('draft', 'approved', 'paid');

-- CreateEnum
CREATE TYPE "AgentChangeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PortalStaffRole" AS ENUM ('admin', 'verifier');

-- CreateEnum
CREATE TYPE "AgentTemplateKind" AS ENUM ('customer', 'agent');

-- CreateTable
CREATE TABLE "agent_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signupUrl" TEXT,
    "callbackUrl" TEXT,
    "status" "AgentProductStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_product_credentials" (
    "productId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_product_credentials_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "agent_commission_rules" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "plan" TEXT,
    "activationFee" INTEGER NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "activationCommission" INTEGER NOT NULL,
    "tier1Amount" INTEGER NOT NULL,
    "tier1Months" INTEGER NOT NULL,
    "tier2Amount" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "agent_commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "payoutMethod" TEXT NOT NULL,
    "payoutAccountName" TEXT NOT NULL,
    "payoutAccountNumber" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'pending',
    "uplineAgentId" TEXT,
    "agreementAcceptedAt" TIMESTAMP(3) NOT NULL,
    "agreementVersion" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_payout_detail_changes" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "oldValues" JSONB NOT NULL,
    "newValues" JSONB NOT NULL,
    "status" "AgentChangeStatus" NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_payout_detail_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_referrals" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "agentId" TEXT,
    "plan" TEXT,
    "signedUpAt" TIMESTAMP(3) NOT NULL,
    "status" "AgentReferralStatus" NOT NULL DEFAULT 'lead',
    "paidMonths" INTEGER NOT NULL DEFAULT 0,
    "commissionRuleId" TEXT,
    "reportedAgentCode" TEXT,
    "agentAttachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_contract_templates" (
    "id" TEXT NOT NULL,
    "kind" "AgentTemplateKind" NOT NULL DEFAULT 'customer',
    "productId" TEXT,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_contracts" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerPosition" TEXT NOT NULL,
    "signerPhone" TEXT NOT NULL,
    "signaturePath" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "minimumTermEndsAt" TIMESTAMP(3) NOT NULL,
    "pdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_payments" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "type" "AgentPaymentType" NOT NULL,
    "monthsCovered" INTEGER NOT NULL DEFAULT 1,
    "billingMonthStart" DATE,
    "amount" INTEGER NOT NULL,
    "bankReference" TEXT NOT NULL,
    "receiptPath" TEXT,
    "status" "AgentPaymentStatus" NOT NULL DEFAULT 'submitted',
    "sourceEventId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reverseReason" TEXT,

    CONSTRAINT "agent_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commissions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" "AgentCommissionKind" NOT NULL,
    "paidMonthNumber" INTEGER,
    "amount" INTEGER NOT NULL,
    "status" "AgentCommissionStatus" NOT NULL DEFAULT 'pending_release',
    "payableFrom" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "ruleId" TEXT NOT NULL,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_payouts" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "total" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "status" "AgentPayoutStatus" NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "externalCustomerId" TEXT,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_audit_log" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "portal_staff" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PortalStaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_products_slug_key" ON "agent_products"("slug");

-- CreateIndex
CREATE INDEX "agent_commission_rules_productId_plan_validFrom_idx" ON "agent_commission_rules"("productId", "plan", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "agents_authUserId_key" ON "agents"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_referralCode_key" ON "agents"("referralCode");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agent_payout_detail_changes_status_createdAt_idx" ON "agent_payout_detail_changes"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_payout_detail_changes_agentId_idx" ON "agent_payout_detail_changes"("agentId");

-- CreateIndex
CREATE INDEX "agent_referrals_agentId_status_idx" ON "agent_referrals"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_referrals_productId_externalCustomerId_key" ON "agent_referrals"("productId", "externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_contract_templates_kind_productId_version_key" ON "agent_contract_templates"("kind", "productId", "version");

-- CreateIndex
CREATE INDEX "agent_contracts_referralId_idx" ON "agent_contracts"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_payments_bankReference_key" ON "agent_payments"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "agent_payments_sourceEventId_key" ON "agent_payments"("sourceEventId");

-- CreateIndex
CREATE INDEX "agent_payments_status_submittedAt_idx" ON "agent_payments"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "agent_payments_referralId_billingMonthStart_idx" ON "agent_payments"("referralId", "billingMonthStart");

-- CreateIndex
CREATE UNIQUE INDEX "agent_commissions_reversesId_key" ON "agent_commissions"("reversesId");

-- CreateIndex
CREATE INDEX "agent_commissions_agentId_status_payableFrom_idx" ON "agent_commissions"("agentId", "status", "payableFrom");

-- CreateIndex
CREATE INDEX "agent_commissions_paymentId_idx" ON "agent_commissions"("paymentId");

-- CreateIndex
CREATE INDEX "agent_commissions_payoutId_idx" ON "agent_commissions"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_payouts_agentId_period_key" ON "agent_payouts"("agentId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_eventId_key" ON "agent_events"("eventId");

-- CreateIndex
CREATE INDEX "agent_events_productId_externalCustomerId_processedAt_idx" ON "agent_events"("productId", "externalCustomerId", "processedAt");

-- CreateIndex
CREATE INDEX "agent_events_receivedAt_idx" ON "agent_events"("receivedAt");

-- CreateIndex
CREATE INDEX "agent_audit_log_entity_entityId_idx" ON "agent_audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "agent_audit_log_at_idx" ON "agent_audit_log"("at");

-- CreateIndex
CREATE UNIQUE INDEX "portal_staff_authUserId_key" ON "portal_staff"("authUserId");

-- AddForeignKey
ALTER TABLE "agent_product_credentials" ADD CONSTRAINT "agent_product_credentials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commission_rules" ADD CONSTRAINT "agent_commission_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_uplineAgentId_fkey" FOREIGN KEY ("uplineAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_payout_detail_changes" ADD CONSTRAINT "agent_payout_detail_changes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_referrals" ADD CONSTRAINT "agent_referrals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_referrals" ADD CONSTRAINT "agent_referrals_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_referrals" ADD CONSTRAINT "agent_referrals_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "agent_commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_contract_templates" ADD CONSTRAINT "agent_contract_templates_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_contracts" ADD CONSTRAINT "agent_contracts_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "agent_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_contracts" ADD CONSTRAINT "agent_contracts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "agent_contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_payments" ADD CONSTRAINT "agent_payments_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "agent_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "agent_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "agent_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "agent_commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "agent_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "agent_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_payouts" ADD CONSTRAINT "agent_payouts_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "agent_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
