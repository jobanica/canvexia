-- ============================================================================
-- Putting wiped storefront configuration back, without guessing who was hit.
-- ============================================================================
--
-- The overwrite replaced paymentConfig / deliveryConfig / bookingConfig with
-- defaults. Those columns aren't versioned, so the old values can only come
-- from a BACKUP.
--
-- Don't try to identify the affected shops by querying live. It can't be done:
-- saving ANY storefront setting — even just opening hours — writes all three
-- config columns, so "config exists but is blank" describes both a wiped shop
-- and one that simply never enabled GCash or delivery. Any list built that way
-- is mostly false positives.
--
-- Instead, let the backup decide and make the restore SELF-LIMITING: generate
-- an UPDATE for every shop that HAD configuration in the backup, and guard each
-- one so it only writes where the live row is CURRENTLY BLANK.
--
--   * wiped shop      → live is blank → restored.
--   * untouched shop  → live still has its settings → guard fails → skipped.
--   * changed since   → live has newer settings → guard fails → NOT reverted.
--
-- So it fixes the damage and cannot overwrite anybody's good or newer data.
--
-- ---------------------------------------------------------------------------
-- STEP 1 — Supabase → Database → Backups. Restore a snapshot from BEFORE the
-- overwrite into a NEW project (Restore → to a new project). Never over live:
-- that would roll back every order, payment and shift taken since.
--
-- STEP 2 — run this in the RESTORED copy. Copy the whole output column.
-- ---------------------------------------------------------------------------
SELECT format(
$fmt$UPDATE storefront_settings s SET
  "hours"           = %L,
  "deliveryZones"   = %L,
  "paymentConfig"   = %L,
  "bookingConfig"   = %L,
  "deliveryConfig"  = %L,
  "acceptsBookings" = %L
FROM restaurants r
WHERE r.id = s."restaurantId"
  AND r.slug = %L
  -- GUARD: only where the live row is blank right now. A shop that still has
  -- its settings, or has changed them since the backup, is left alone.
  AND coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false) = false
  AND coalesce((s."paymentConfig"->>'mayaEnabled')::boolean,  false) = false
  AND coalesce((s."paymentConfig"->>'bankEnabled')::boolean,  false) = false
  AND coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) = 0
  AND coalesce((s."deliveryConfig"->>'perKm')::numeric, 0) = 0
  AND jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) = 0;$fmt$,
  s."hours",
  s."deliveryZones",
  s."paymentConfig",
  s."bookingConfig",
  s."deliveryConfig",
  s."acceptsBookings",
  r.slug
) AS restore_statement
FROM storefront_settings s
JOIN restaurants r ON r.id = s."restaurantId"
-- Only shops that actually HAD something configured in the backup. There is no
-- point generating a statement that would restore blanks over blanks.
WHERE r.status = 'active'
  AND (
    coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false)
    OR coalesce((s."paymentConfig"->>'mayaEnabled')::boolean, false)
    OR coalesce((s."paymentConfig"->>'bankEnabled')::boolean, false)
    OR coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) > 0
    OR coalesce((s."deliveryConfig"->>'perKm')::numeric, 0) > 0
    OR jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) > 0
  )
ORDER BY r.slug;

-- ---------------------------------------------------------------------------
-- STEP 3 — paste the output into the LIVE project and run it.
--
-- Postgres reports how many rows each statement touched. UPDATE 1 means that
-- shop was wiped and is now restored; UPDATE 0 means it was fine and was
-- skipped. The count of 1s is your real damage figure — the one the live
-- database could never tell you on its own.
--
-- STEP 4 — verify with check-storefront-settings.sql, and have one owner
-- (Wen Cy's shop is a known case) confirm their GCash and delivery pricing are
-- back on the settings page.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- No backup covering that day? Then the values are gone and have to be
-- re-entered by hand. Say so plainly rather than keep querying — and before
-- anyone re-enters anything, confirm the fix is deployed, or the work can be
-- lost a second time.
-- ---------------------------------------------------------------------------
