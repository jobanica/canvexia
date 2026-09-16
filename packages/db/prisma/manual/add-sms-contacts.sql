-- A8.1: the partner's own SMS contacts, and consent as a first-class fact.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- SEPARATE FROM `customer_contacts`, which is a restaurant's diners. These are
-- business owners a partner met while prospecting: a different axis, a
-- different consent trail, and a different person doing the collecting. Sharing
-- one table would mean one row that two tenants both have a claim on, which is
-- exactly what D29 took apart for merchants.

-- ----------------------------------------------------------------------------
-- 1. The contacts.
--
-- CONSENT IS FOUR COLUMNS, NOT A BOOLEAN: the status, when it changed, where it
-- came from, and the EVIDENCE — the sentence somebody could be shown if they
-- complain. "Verbal at visit, logged by Ana Reyes" is the whole point; a `true`
-- proves nothing and cannot be defended.
--
-- `unknown` is the default and is not a soft yes. The brief is explicit that
-- only `opted_in` may be sent to, and that a partner cannot move somebody back
-- to opted_in without a NEW consent event.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_contacts" (
  "id"             TEXT PRIMARY KEY,
  "partnerId"      TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  /* E.164, normalised on the way in by core's normalizeMobile. */
  "mobile"         TEXT NOT NULL,
  "name"           TEXT,
  "businessName"   TEXT,
  /* visit | lead_form | merchant_owner | import | manual */
  "source"         TEXT NOT NULL DEFAULT 'manual',

  /* The prospect or merchant this is, when it is one. A merchant id is unique
     only WITHIN a product (D29), so the product is stored beside it. */
  "prospectId"     TEXT,
  "productId"      TEXT,
  "merchantId"     TEXT,

  "tags"           TEXT[] NOT NULL DEFAULT '{}',

  /* opted_in | opted_out | unknown */
  "consentStatus"   TEXT NOT NULL DEFAULT 'unknown',
  "consentAt"       TIMESTAMP(3),
  /* visit | lead_form | merchant_owner | import_attested | manual | reply */
  "consentSource"   TEXT,
  /* The sentence that would be shown if somebody complains. */
  "consentEvidence" TEXT,
  "optedOutAt"      TIMESTAMP(3),
  /* Set when the one opt-out confirmation has gone out, so it goes ONCE. */
  "optOutConfirmedAt" TIMESTAMP(3),

  "lastSentAt"     TIMESTAMP(3),
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_contacts_consent_check"
    CHECK ("consentStatus" IN ('opted_in', 'opted_out', 'unknown')),
  CONSTRAINT "sms_contacts_source_check"
    CHECK ("source" IN ('visit', 'lead_form', 'merchant_owner', 'import', 'manual'))
);

-- ONE ROW PER NUMBER PER PARTNER. Four spellings of a number is four rows that
-- look like four people, and it is also four texts to one person.
CREATE UNIQUE INDEX IF NOT EXISTS "sms_contacts_partner_mobile_key"
  ON "sms_contacts" ("partnerId", "mobile");
CREATE INDEX IF NOT EXISTS "sms_contacts_partner_consent_idx"
  ON "sms_contacts" ("partnerId", "consentStatus");
-- The opt-out webhook looks a number up across every partner: STOP means STOP
-- everywhere, so this index is not partner-scoped.
CREATE INDEX IF NOT EXISTS "sms_contacts_mobile_idx" ON "sms_contacts" ("mobile");

-- ----------------------------------------------------------------------------
-- 2. The partner's sender name.
--
-- `restaurants.smsSenderName` already exists and is the WRONG TABLE for this: it
-- is a merchant's sender, has no status, and a partner is not a merchant. A
-- sender name has to be registered with the aggregator by hand, so it carries a
-- status and sends fall back to CANVEXIA's default until HQ marks it approved.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsSenderName"   TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsSenderStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS "partners_sms_sender_status_check";
ALTER TABLE "partners"
  ADD CONSTRAINT "partners_sms_sender_status_check"
  CHECK ("smsSenderStatus" IN ('none', 'pending', 'approved', 'rejected'));

-- ----------------------------------------------------------------------------
-- 3. The opt-out wording.
--
-- CONFIGURABLE, NOT REMOVABLE — the brief's words, and the law's. Stored per
-- partner so an operator can write it in the language their contacts read; the
-- code refuses an empty one and appends it to every marketing message.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsOptOutText" TEXT;
