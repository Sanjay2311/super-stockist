-- tasks.created_by holds AppUser.id (Supabase auth uid), but system actors and
-- test users need not be uuids — mirror audit_log.user_id and store it as text.
ALTER TABLE "tasks" ALTER COLUMN "created_by" SET DATA TYPE text;
