-- Realtime "admin" channel triggers for the tables introduced by the newer admin centers
-- (referrals & rewards, Meras AI, bundles, refunds/settlements, waitlist, audit log).
-- All statement-level, idempotent, and reuse the existing meras_sync_admin_statement() function.
DROP TRIGGER IF EXISTS sync_referral_program_settings_admin ON referral_program_settings;
CREATE TRIGGER sync_referral_program_settings_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON referral_program_settings FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_referral_tiers_admin ON referral_tiers;
CREATE TRIGGER sync_referral_tiers_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON referral_tiers FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_referral_attributions_admin ON referral_attributions;
CREATE TRIGGER sync_referral_attributions_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON referral_attributions FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_user_rewards_admin ON user_rewards;
CREATE TRIGGER sync_user_rewards_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON user_rewards FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_coupon_uses_admin ON coupon_uses;
CREATE TRIGGER sync_coupon_uses_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON coupon_uses FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_ai_api_keys_admin ON ai_api_keys;
CREATE TRIGGER sync_ai_api_keys_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ai_api_keys FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_ai_service_settings_admin ON ai_service_settings;
CREATE TRIGGER sync_ai_service_settings_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ai_service_settings FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_ai_entitlements_admin ON ai_entitlements;
CREATE TRIGGER sync_ai_entitlements_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ai_entitlements FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_ai_subscription_orders_admin ON ai_subscription_orders;
CREATE TRIGGER sync_ai_subscription_orders_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ai_subscription_orders FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_course_bundles_admin ON course_bundles;
CREATE TRIGGER sync_course_bundles_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_bundles FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_course_bundle_items_admin ON course_bundle_items;
CREATE TRIGGER sync_course_bundle_items_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_bundle_items FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_refund_requests_admin ON refund_requests;
CREATE TRIGGER sync_refund_requests_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON refund_requests FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_admin_approvals_admin ON admin_approvals;
CREATE TRIGGER sync_admin_approvals_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON admin_approvals FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_payment_settlements_admin ON payment_settlements;
CREATE TRIGGER sync_payment_settlements_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON payment_settlements FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_payment_settlement_lines_admin ON payment_settlement_lines;
CREATE TRIGGER sync_payment_settlement_lines_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON payment_settlement_lines FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_course_waitlist_admin ON course_waitlist;
CREATE TRIGGER sync_course_waitlist_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_waitlist FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_audit_logs_admin ON audit_logs;
CREATE TRIGGER sync_audit_logs_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
--> statement-breakpoint
SELECT meras_touch_sync('admin', '*');
