CREATE TABLE "price_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quotation_item_id" uuid NOT NULL,
	"requested_rate" bigint NOT NULL,
	"original_rate" bigint NOT NULL,
	"reason" text,
	"requested_by" text NOT NULL,
	"approver_id" text,
	"decision" text DEFAULT 'PENDING' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"requested_rate" bigint NOT NULL,
	"list_rate" bigint NOT NULL,
	"floor_rate" bigint NOT NULL,
	"target_rate" bigint NOT NULL,
	"scheme_id" uuid,
	"discount" bigint DEFAULT 0 NOT NULL,
	"scheme_benefit" bigint DEFAULT 0 NOT NULL,
	"gst_pct" integer NOT NULL,
	"net_amount" bigint NOT NULL,
	"approval_status" text DEFAULT 'AUTO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_no" text NOT NULL,
	"lead_id" uuid,
	"distributor_id" uuid,
	"employee_id" uuid,
	"quote_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_approvals" ADD CONSTRAINT "price_approvals_quotation_item_id_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_approvals_org_decision_idx" ON "price_approvals" USING btree ("org_id","decision");--> statement-breakpoint
CREATE INDEX "quotation_items_quotation_idx" ON "quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotations_org_status_idx" ON "quotations" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_org_quote_no_idx" ON "quotations" USING btree ("org_id","quote_no");--> statement-breakpoint
-- hand-appended (not emitted by drizzle-kit generate): a quotation targets exactly one of lead / distributor
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_party_ck" CHECK (("lead_id" IS NOT NULL) <> ("distributor_id" IS NOT NULL));