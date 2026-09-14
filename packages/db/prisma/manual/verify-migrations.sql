-- ============================================================================
-- READ-ONLY. "Did every migration actually land?"
-- ============================================================================
--
-- Run the whole file. Every row should read `true`. Anything `false` names the
-- script still to run — the fourth column tells you which one.
--
-- Worth running after a batch: a SQL editor stops at the first failing
-- statement, so a script pasted in with an earlier one can apply half of itself
-- and look like it succeeded. The features backed by the missing half then fail
-- quietly, because the app is written to degrade rather than crash when a
-- column is absent.
-- ============================================================================

WITH col AS (
  SELECT table_name, column_name FROM information_schema.columns
)
SELECT * FROM (
  VALUES
    -- Third-party tender (Grab / foodpanda settled without cash or card).
    ('payments.method = third_party',
     EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'PaymentMethod' AND e.enumlabel = 'third_party'),
     'add-third-party-tender.sql'),

    -- Kitchen item cross-out + per-item refunds.
    ('order_items.preparedAt',
     EXISTS (SELECT 1 FROM col WHERE table_name='order_items' AND column_name='preparedAt'),
     'add-item-prepared-and-refunds.sql'),
    ('order_items.refundedQty',
     EXISTS (SELECT 1 FROM col WHERE table_name='order_items' AND column_name='refundedQty'),
     'add-item-prepared-and-refunds.sql'),
    ('order_items.refundedAmount',
     EXISTS (SELECT 1 FROM col WHERE table_name='order_items' AND column_name='refundedAmount'),
     'add-item-prepared-and-refunds.sql'),

    -- POS-only items and the card surcharge.
    ('menu_items.posOnly',
     EXISTS (SELECT 1 FROM col WHERE table_name='menu_items' AND column_name='posOnly'),
     'add-pos-only-and-surcharge.sql'),
    ('orders.surchargeAmount',
     EXISTS (SELECT 1 FROM col WHERE table_name='orders' AND column_name='surchargeAmount'),
     'add-pos-only-and-surcharge.sql'),
    ('orders.surchargeLabel',
     EXISTS (SELECT 1 FROM col WHERE table_name='orders' AND column_name='surchargeLabel'),
     'add-pos-only-and-surcharge.sql'),

    -- Table QRs became a paid unlock; existing accounts keep unlimited.
    ('restaurants.qrGrandfathered',
     EXISTS (SELECT 1 FROM col WHERE table_name='restaurants' AND column_name='qrGrandfathered'),
     'add-qr-grandfather.sql'),

    -- Receipt-on-payment and cash-drawer policy.
    ('restaurants.autoPrintReceipt',
     EXISTS (SELECT 1 FROM col WHERE table_name='restaurants' AND column_name='autoPrintReceipt'),
     'add-drawer-receipt-settings.sql'),
    ('restaurants.openDrawerOn',
     EXISTS (SELECT 1 FROM col WHERE table_name='restaurants' AND column_name='openDrawerOn'),
     'add-drawer-receipt-settings.sql'),

    -- One AI menu scan per partner demo.
    ('restaurants.menuScannedAt',
     EXISTS (SELECT 1 FROM col WHERE table_name='restaurants' AND column_name='menuScannedAt'),
     'add-menu-scanned-at.sql'),

    -- Second printer at the pass (only needed for a CLOUD kitchen printer).
    ('print_jobs.station',
     EXISTS (SELECT 1 FROM col WHERE table_name='print_jobs' AND column_name='station'),
     'add-print-job-station.sql'),

    -- The partner portal.
    ('partners (table)',
     to_regclass('public.partners') IS NOT NULL,
     'add-partner-program.sql'),
    ('program_settings (table)',
     to_regclass('public.program_settings') IS NOT NULL,
     'add-partner-program.sql'),
    ('restaurants.demoPartnerId',
     EXISTS (SELECT 1 FROM col WHERE table_name='restaurants' AND column_name='demoPartnerId'),
     'add-partner-program.sql'),
    ('staff_users.username',
     EXISTS (SELECT 1 FROM col WHERE table_name='staff_users' AND column_name='username'),
     'add-partner-program.sql')
) AS t(feature, present, script)
ORDER BY present, feature;
