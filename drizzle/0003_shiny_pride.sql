CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"distributor_id" uuid,
	"employee_id" uuid,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"notes" text,
	"outcome" text,
	"next_action" text,
	"next_follow_up_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "distributor_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"territory_id" uuid,
	"pincode" text,
	"location" text,
	"existing_business_type" text,
	"years_in_business" integer,
	"current_categories" jsonb,
	"approx_monthly_turnover" bigint,
	"estimated_category_turnover" bigint,
	"expected_ff_monthly_potential" bigint DEFAULT 0 NOT NULL,
	"working_capital_capability" text,
	"expected_credit_requirement" bigint,
	"warehouse" text,
	"delivery_vehicles" integer DEFAULT 0 NOT NULL,
	"salesmen" integer DEFAULT 0 NOT NULL,
	"retailer_network" integer DEFAULT 0 NOT NULL,
	"geographic_coverage" text,
	"score_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"grade" text DEFAULT 'REJECT' NOT NULL,
	"stage" text DEFAULT 'IDENTIFIED' NOT NULL,
	"probability" integer DEFAULT 5 NOT NULL,
	"assigned_employee_id" uuid,
	"next_follow_up_at" timestamp with time zone,
	"converted_distributor_id" uuid,
	"lost_reason" text,
	"lost_notes" text,
	"on_hold_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"areas_visited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"blockers" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"lead_id" uuid,
	"distributor_id" uuid,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"due_date" date NOT NULL,
	"assigned_employee_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"created_by" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "emp_daily_report_uk" ON "employee_daily_reports" USING btree ("org_id","employee_id","report_date");--> statement-breakpoint
-- hand-appended (not emitted by drizzle-kit generate): activities must target a lead or a distributor
ALTER TABLE "activities" ADD CONSTRAINT "activities_target_ck" CHECK ("lead_id" IS NOT NULL OR "distributor_id" IS NOT NULL);