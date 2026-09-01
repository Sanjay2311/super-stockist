CREATE TABLE "distributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"territory_id" uuid,
	"exclusive" boolean DEFAULT false NOT NULL,
	"exclusivity_note" text,
	"assigned_employee_id" uuid,
	"appointment_date" date,
	"status" text DEFAULT 'APPROVED' NOT NULL,
	"grade" text,
	"credit_limit" bigint DEFAULT 0 NOT NULL,
	"credit_days" integer DEFAULT 0 NOT NULL,
	"payment_terms" text,
	"expected_monthly_purchase" bigint DEFAULT 0 NOT NULL,
	"product_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_date" date,
	"agreement_status" text,
	"source_lead_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "distributors_org_status_idx" ON "distributors" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "distributors_org_territory_idx" ON "distributors" USING btree ("org_id","territory_id");--> statement-breakpoint
CREATE INDEX "distributors_org_deleted_idx" ON "distributors" USING btree ("org_id","deleted_at");