CREATE TABLE "app_config" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_config_org_id_key_pk" PRIMARY KEY("org_id","key")
);
