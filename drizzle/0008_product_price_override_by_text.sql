-- product_prices.override_by holds AppUser.id (Supabase auth uid), but system
-- actors and test users need not be uuids — mirror audit_log.user_id / tasks.created_by
-- and store it as text.
ALTER TABLE "product_prices" ALTER COLUMN "override_by" SET DATA TYPE text;