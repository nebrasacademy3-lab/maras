-- Additive ownership cutover. Run once through the migration journal, after backup.
-- No financial snapshot is rewritten. Unknown/contradictory owners remain unbound.
ALTER TABLE "orders" ADD COLUMN "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "orders_owner_created_idx" ON "orders" ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "order_ownership_reviews" (
  "order_id" integer PRIMARY KEY REFERENCES "orders"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "candidate_count" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "resolved_at" text
);
--> statement-breakpoint
-- Server-generated checkout keys and coupon reservations are stable-ID evidence.
-- A changed email is not a reason to transfer such an order to its new holder.
CREATE TEMP TABLE "maras_owner_candidates" ON COMMIT DROP AS
WITH evidence AS (
  SELECT o.id, o.created_at, o.checkout_key,
    CASE WHEN o.checkout_key ~ '^[1-9][0-9]{0,9}:[A-Za-z0-9_-]{12,90}$'
      THEN CASE WHEN split_part(o.checkout_key, ':', 1)::bigint <= 2147483647
        THEN split_part(o.checkout_key, ':', 1)::integer END END AS checkout_owner,
    (SELECT min(cu.user_id) FROM coupon_uses cu WHERE cu.order_number = o.order_number) AS coupon_owner,
    (SELECT count(DISTINCT cu.user_id)::int FROM coupon_uses cu WHERE cu.order_number = o.order_number) AS coupon_count,
    (SELECT min(u.id) FROM users u WHERE lower(btrim(u.email)) = lower(btrim(o.customer_email))) AS email_owner,
    (SELECT count(*)::int FROM users u WHERE lower(btrim(u.email)) = lower(btrim(o.customer_email))) AS email_count
  FROM orders o
), chosen AS (
  SELECT e.*, CASE
    WHEN checkout_key IS NOT NULL AND checkout_owner IS NULL THEN NULL
    WHEN coupon_count > 1 THEN NULL
    WHEN checkout_owner IS NOT NULL AND coupon_owner IS NOT NULL AND checkout_owner <> coupon_owner THEN NULL
    WHEN checkout_owner IS NOT NULL THEN checkout_owner
    WHEN coupon_owner IS NOT NULL THEN coupon_owner
    WHEN email_count = 1 THEN email_owner
    ELSE NULL END AS candidate
  FROM evidence e
)
SELECT c.id, c.email_count,
  CASE WHEN u.id IS NOT NULL
    AND (CASE WHEN pg_input_is_valid(u.created_at, 'timestamp with time zone') THEN u.created_at::timestamptz END)
      <= (CASE WHEN pg_input_is_valid(c.created_at, 'timestamp with time zone') THEN c.created_at::timestamptz END)
    AND (c.checkout_owner IS NOT NULL OR c.coupon_owner IS NOT NULL OR (
      NOT EXISTS (SELECT 1 FROM email_change_requests ec WHERE ec.user_id = u.id
        AND ec.current_verified_at IS NOT NULL AND ec.new_verified_at IS NOT NULL AND ec.used_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.entity_type = 'user' AND al.entity_id = u.id::text
        AND al.action IN ('change_email', 'delete-account'))
    )) THEN u.id END AS owner_id
FROM chosen c LEFT JOIN users u ON u.id = c.candidate;
--> statement-breakpoint
UPDATE orders o SET user_id = c.owner_id FROM maras_owner_candidates c
WHERE o.id = c.id AND c.owner_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO order_ownership_reviews (order_id, reason, candidate_count)
SELECT o.id, 'legacy_ownership_unproven', c.email_count FROM orders o
JOIN maras_owner_candidates c ON c.id = o.id WHERE o.user_id IS NULL;
--> statement-breakpoint
-- Runtime cannot silently clear or reassign either a bound or a quarantined owner.
-- A reviewed correction requires a separate, audited offline migration.
CREATE FUNCTION prevent_order_owner_reassignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Order ownership correction requires an audited offline migration' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_owner_immutable BEFORE UPDATE OF user_id ON orders
FOR EACH ROW EXECUTE FUNCTION prevent_order_owner_reassignment();
--> statement-breakpoint
CREATE FUNCTION record_unresolved_order_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    INSERT INTO order_ownership_reviews(order_id, reason, candidate_count)
    VALUES (NEW.id, 'missing_owner_at_creation', 0) ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_missing_owner_review AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION record_unresolved_order_owner();
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "target_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "notifications_target_user_idx" ON "notifications" ("target_user_id", "created_at");
--> statement-breakpoint
-- Private historical notifications only bind to one account that predates them.
-- An orphan retains user_email, so it can never satisfy the broadcast predicate.
UPDATE notifications n SET target_user_id = u.id
FROM users u
WHERE n.user_email IS NOT NULL AND lower(btrim(n.user_email)) = lower(btrim(u.email))
  AND (SELECT count(*) FROM users du WHERE lower(btrim(du.email)) = lower(btrim(n.user_email))) = 1
  AND (CASE WHEN pg_input_is_valid(u.created_at, 'timestamp with time zone') THEN u.created_at::timestamptz END)
    <= (CASE WHEN pg_input_is_valid(n.created_at, 'timestamp with time zone') THEN n.created_at::timestamptz END)
  AND NOT EXISTS (SELECT 1 FROM email_change_requests ec WHERE ec.user_id = u.id
    AND ec.current_verified_at IS NOT NULL AND ec.new_verified_at IS NOT NULL AND ec.used_at IS NOT NULL);
--> statement-breakpoint
-- Compatibility for existing notification writers: resolve a CURRENT destination at
-- insertion only. Scheduled financial writers explicitly provide target_user_id.
CREATE FUNCTION bind_notification_recipient_on_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE candidates integer; recipient integer;
BEGIN
  IF NEW.target_user_id IS NULL AND NEW.user_email IS NOT NULL THEN
    SELECT count(*)::int, min(id) INTO candidates, recipient FROM users
    WHERE lower(btrim(email)) = lower(btrim(NEW.user_email)) AND status = 'active';
    IF candidates = 1 THEN NEW.target_user_id := recipient; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notifications_bind_recipient BEFORE INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION bind_notification_recipient_on_insert();
