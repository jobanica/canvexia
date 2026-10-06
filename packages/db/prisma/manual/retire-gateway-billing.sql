-- ============================================================================
-- Retire gateway billing (D38).
--
-- 1. Every restaurant moves to manual billing (QR / bank transfer, receipts
--    confirmed in the agent portal), and new rows default to it.
-- 2. Every live restaurant the agent portal has not been told about gets a
--    queued customer.signed_up, so its first receipt has a customer to land
--    on. Idempotent: a restaurant that already has one queued is skipped.
--    Delivered by Servd's outbox cron once AGENT_PORTAL_* is configured.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- restaurants and product_event_outbox have FORCE ROW LEVEL SECURITY: run as
-- anyone but a superuser, the UPDATE and INSERT below would quietly touch no
-- rows. The system context makes them apply for whoever runs this.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "restaurants" ALTER COLUMN "billingMode" SET DEFAULT 'manual';
UPDATE "restaurants" SET "billingMode" = 'manual' WHERE "billingMode" <> 'manual';

INSERT INTO "product_event_outbox" ("id", "productSlug", "eventId", "type", "payload")
SELECT gen_random_uuid()::text,
       'servd',
       'evt_backfill_' || r.id,
       'customer.signed_up',
       json_build_object(
         'event_id', 'evt_backfill_' || r.id,
         'type', 'customer.signed_up',
         'occurred_at', to_char(r."createdAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'data', json_build_object(
           'external_customer_id', r.id,
           'business_name', coalesce(nullif(r."displayName", ''), r.name),
           'owner_name', 'Owner of ' || coalesce(nullif(r."displayName", ''), r.name),
           'owner_phone', coalesce(nullif(r."contactPhone", ''), 'not given'),
           'agent_code', null,
           'plan', null
         )
       )::jsonb
  FROM "restaurants" r
 WHERE r.status IN ('active', 'suspended')
   AND NOT EXISTS (
     SELECT 1 FROM "product_event_outbox" o
      WHERE o.type = 'customer.signed_up'
        AND o.payload -> 'data' ->> 'external_customer_id' = r.id
   );

COMMIT;
