-- ============================================================================
-- WHO SIGNED THE MERCHANTS THAT ALREADY EXIST.
--
-- `assignedSalesUserId` has been READ since A7 — the commission run, the staff
-- scorecard, the staff screen, both reassignment paths — and was written by
-- none of them at the moment a merchant was opened. Provisioning now stamps the
-- seat that did it; this fills in the ones that predate that.
--
-- FROM THE AUDIT LOG, which is the only record of who did it. The provisioning
-- row carries `actorEmail`, so a merchant whose creation was attributed to a
-- person can be matched back to that person's seat at the same partner.
--
-- A GUESS IS NOT MADE. A creation row with no actorEmail — and there is one on
-- this database, from before the field was recorded — is left alone. "Nobody
-- yet" is a visible, fixable state that an operator can correct from the team
-- screen; a wrong name is one somebody rings at 8pm.
--
-- Both columns, matching what provisioning now does: the agent who signed the
-- shop is who that shop rings.
--
-- Idempotent — only rows that are still unassigned, so re-running cannot
-- overwrite a reassignment somebody has since made by hand.
-- ============================================================================

UPDATE "pharmacies" p
   SET "assignedSalesUserId"   = u."id",
       "assignedSupportUserId" = COALESCE(p."assignedSupportUserId", u."id")
  FROM "audit_logs" a
  JOIN "partner_users" u
    ON lower(u."email") = lower(a."actorEmail")
 WHERE a."entityType" = 'pharmacy'
   AND a."action"     = 'pharmacy.provision'
   AND a."entityId"   = p."id"
   AND a."actorEmail" IS NOT NULL
   -- The seat has to belong to the partner that owns the merchant. Without
   -- this an email reused across two operators would credit the wrong one.
   AND u."partnerId"  = p."partnerId"
   AND p."assignedSalesUserId" IS NULL;

UPDATE "restaurants" r
   SET "assignedSalesUserId"   = u."id",
       "assignedSupportUserId" = COALESCE(r."assignedSupportUserId", u."id")
  FROM "audit_logs" a
  JOIN "partner_users" u
    ON lower(u."email") = lower(a."actorEmail")
 WHERE a."entityType" = 'merchant'
   AND a."action" LIKE '%provision%'
   AND a."entityId"   = r."id"
   AND a."actorEmail" IS NOT NULL
   AND u."partnerId"  = r."partnerId"
   AND r."assignedSalesUserId" IS NULL;
