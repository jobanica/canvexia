-- Gift cards / store credit. Run in the Supabase SQL editor. Idempotent.

-- Order columns: how much of the bill was paid by a redeemed gift card.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "creditApplied" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "giftCardId" TEXT;

-- Gift cards.
CREATE TABLE IF NOT EXISTS "gift_cards" (
  "id"             TEXT NOT NULL,
  "restaurantId"   TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "initialBalance" INTEGER NOT NULL,
  "balance"        INTEGER NOT NULL,
  "customerPhone"  TEXT,
  "customerName"   TEXT,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gift_cards_restaurantId_code_key" ON "gift_cards" ("restaurantId", "code");
CREATE INDEX IF NOT EXISTS "gift_cards_restaurantId_idx" ON "gift_cards" ("restaurantId");

-- Gift-card ledger.
CREATE TABLE IF NOT EXISTS "gift_card_txns" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "giftCardId"   TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "kind"         TEXT NOT NULL,
  "orderId"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_card_txns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gift_card_txns_giftCardId_idx" ON "gift_card_txns" ("giftCardId");

DO $$ BEGIN
  ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "gift_card_txns" ADD CONSTRAINT "gift_card_txns_giftCardId_fkey"
    FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "gift_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gift_cards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "gift_cards";
CREATE POLICY tenant_isolation ON "gift_cards"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "gift_cards" TO app_user;

ALTER TABLE "gift_card_txns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gift_card_txns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "gift_card_txns";
CREATE POLICY tenant_isolation ON "gift_card_txns"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "gift_card_txns" TO app_user;
