CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ss_billing_price" bigint NOT NULL,
	"distributor_price" bigint NOT NULL,
	"floor_price" bigint NOT NULL,
	"target_price" bigint NOT NULL,
	"retailer_price" bigint,
	"mrp" bigint,
	"is_demo_assumption" boolean DEFAULT false NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"override_by" uuid,
	"override_at" timestamp with time zone,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid,
	"category_id" uuid NOT NULL,
	"sku_code" text NOT NULL,
	"name" text NOT NULL,
	"pack_label" text NOT NULL,
	"pack_grams" integer,
	"unit" text DEFAULT 'G' NOT NULL,
	"mrp" bigint,
	"gst_pct" integer DEFAULT 5 NOT NULL,
	"shelf_life_days" integer,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"max_stock" integer DEFAULT 0 NOT NULL,
	"preferred_stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"volatile_price" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_product_idx" ON "product_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_idx" ON "products" USING btree ("org_id","sku_code");--> statement-breakpoint
CREATE INDEX "products_org_cat_idx" ON "products" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "products_org_active_idx" ON "products" USING btree ("org_id","active");