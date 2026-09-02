CREATE TABLE "scheme_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"quotation_id" uuid,
	"quotation_item_id" uuid,
	"distributor_id" uuid,
	"actual_benefit" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"min_qty" integer,
	"min_value" bigint,
	"benefit" jsonb NOT NULL,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheme_applications" ADD CONSTRAINT "scheme_applications_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheme_applications_org_scheme_idx" ON "scheme_applications" USING btree ("org_id","scheme_id");--> statement-breakpoint
CREATE INDEX "schemes_org_active_idx" ON "schemes" USING btree ("org_id","active");