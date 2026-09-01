import { pgTable, uuid, text, integer, bigint, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  brandId: uuid('brand_id'),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  skuCode: text('sku_code').notNull(),
  name: text('name').notNull(),
  packLabel: text('pack_label').notNull(),
  packGrams: integer('pack_grams'),
  unit: text('unit').notNull().default('G'),
  mrp: bigint('mrp', { mode: 'number' }),
  gstPct: integer('gst_pct').notNull().default(5),
  shelfLifeDays: integer('shelf_life_days'),
  reorderLevel: integer('reorder_level').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  maxStock: integer('max_stock').notNull().default(0),
  preferredStock: integer('preferred_stock').notNull().default(0),
  active: boolean('active').notNull().default(true),
  volatilePrice: boolean('volatile_price').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => ({
  skuIdx: uniqueIndex('products_org_sku_idx').on(t.orgId, t.skuCode),
  catIdx: index('products_org_cat_idx').on(t.orgId, t.categoryId),
  activeIdx: index('products_org_active_idx').on(t.orgId, t.active),
}));

export const productPrices = pgTable('product_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  ssBillingPrice: bigint('ss_billing_price', { mode: 'number' }).notNull(),
  distributorPrice: bigint('distributor_price', { mode: 'number' }).notNull(),
  floorPrice: bigint('floor_price', { mode: 'number' }).notNull(),
  targetPrice: bigint('target_price', { mode: 'number' }).notNull(),
  retailerPrice: bigint('retailer_price', { mode: 'number' }),
  mrp: bigint('mrp', { mode: 'number' }),
  isDemoAssumption: boolean('is_demo_assumption').notNull().default(false),
  manualOverride: boolean('manual_override').notNull().default(false),
  overrideBy: uuid('override_by'),
  overrideAt: timestamp('override_at', { withTimezone: true }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  ...ts,
}, (t) => ({ productIdx: uniqueIndex('product_prices_product_idx').on(t.productId) }));
