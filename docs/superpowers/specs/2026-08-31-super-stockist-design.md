# Farm & Farmers — Bangalore East Super Stockist Management System — Design

Date: 2026-08-31
Status: Draft for review
Author: Sanjay (with Claude)

---

## 1. Context and business model

Sanjay is starting as an authorized **super stockist for Farm & Farmers** (premium foods —
dry fruits, seeds, flours, spices) for the **Bangalore East** territory. He is **not**
creating his own GST/company entity now. **Farm & Farmers remains the legal
manufacturer and billing entity**; all invoices and tax documentation stay under F&F's GST.

His job: arrange stock from F&F, hold inventory, appoint distributors, build the Bangalore
East network, drive distributor activation and repeat orders, manage inventory, monitor
one field sales employee, track receivables where applicable, and watch profitability.

The system is a **Super Stockist + Distributor CRM + Inventory + Sales Operations** tool
for daily management — actionable, not vanity metrics. Target: the owner spends 15–30
minutes a day and knows what the employee did, which opportunities are progressing, which
distributors need attention, what sold, what stock exists and is needed, who owes money,
where the margin is, and what to decide today.

### 1.1 Legal/billing data vs management data

- **Manufacturer / billing-entity data** (belongs to F&F, labelled as such in the UI):
  F&F invoice number, invoice date, distributor, invoice amount, GST amount, payment status.
- **Management data** (Sanjay's): leads, territory, pipeline, stock, purchase/receipt
  records, expected/actual sales, employee activity, distributor performance, pricing
  analysis, margins, schemes, expenses, collections visibility, market development.

The app never behaves as if Sanjay independently issues GST invoices.

### 1.2 Commercial arrangement (from Q&A)

- **Revenue basis: buy-sell spread.** Revenue = distributor price x qty; COGS = landed
  cost x qty. A commission-% path is a config stub only, not built.
- **Stock flow:** Sanjay holds physical stock in a Bangalore East warehouse (sourced from
  F&F, Jaipur). Both "F&F bills the distributor directly" (Option 1) and "F&F bills
  Sanjay, who bills the distributor under F&F's GST" (Option 2) are acceptable and not yet
  finalised. The app models F&F as the billing entity and keeps **billing direction
  configurable** (`billing_direction`: `FF_TO_DISTRIBUTOR` default, or `FF_TO_SS`).
- No registered company is required for either option; a proprietorship + own GST
  registration is the likely structure. Not a software concern — recorded for context.

---

## 2. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Process path | Architectural (new project) |
| 2 | Hosting | Supabase (Postgres + Auth) + Cloudflare (Workers via OpenNext) |
| 3 | Framework | Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui |
| 4 | ORM | **Drizzle** (not Prisma) — lighter on Workers, SQL-first migrations. Within spec's "or equivalent". |
| 5 | Auth | Supabase Auth, email + password. Roles/permissions in app layer, **not** Postgres RLS. |
| 6 | Revenue model | Buy-sell spread |
| 7 | Billing entity | Farm & Farmers; `billing_direction` configurable |
| 8 | First milestone | Field CRM slice (see Section 10) |
| 9 | Minimalism discipline | Adopt the **ponytail** ruleset (`AGENTS.md` in repo). Build log + debt ledger per task. |
| 10 | Price sheet usage | Load the **real F&F catalogue and real Current/MRP prices as live starting data**. Only transactional seed data is faker DEMO. |
| 11 | Charts / forms | Recharts; React Hook Form + Zod |
| 12 | Money storage | Integer **paise** |
| 13 | Locale | `en-IN`, INR lakh/crore formatting, `DD MMM YYYY`, timezone `Asia/Kolkata` |

---

## 3. Architecture

### 3.1 Runtime

- **Next.js 15 App Router** deployed to **Cloudflare** via the OpenNext Cloudflare adapter.
- **Mutations** via Server Actions. **Route Handlers** for CSV import/export, downloads, and
  the cron endpoint. Edge/Node-safe code only in the request path (no native deps).

### 3.2 Data access

- **Drizzle ORM** over **Supabase Postgres**: transaction-mode pooler (port 6543) for the
  app, session-mode (5432) for migrations.
- All DB access sits behind a **service layer** (`src/server/services/*`). Server Actions
  and Route Handlers never touch Drizzle directly.
- **Domain calculations** live in a pure, framework-free `src/domain/*` module, unit-tested
  in isolation (pricing, recommendation, scoring, KPIs, profitability, FEFO).

### 3.3 Auth and permissions

- **Supabase Auth** (email + password) issues the session.
- `users` table links the Supabase user id to an app user with a `role` (text) and optional
  `employee_id`.
- Authorization: a static permission matrix in `src/server/auth/permissions.ts`
  (`role -> allowed actions`). `can(user, action, resource)` runs at the top of every
  Server Action and in route middleware. Adding a role = adding a matrix key. No DB-driven
  RBAC (YAGNI; a migration handles per-user overrides if ever needed).
- Cost price and financial fields are stripped server-side for `SALES` before data leaves
  the server.

### 3.4 Project layout

```
src/
  app/                 routes, layouts, server actions co-located per feature
  server/
    services/          distributor, pricing, inventory, orders, kpi, alerts, ...
    auth/              session, permission matrix, can()
    db/                drizzle schema, migrations, client
  domain/              pure calc: scoring, pricing, recommend, kpi, profitability, fefo
  components/          ui primitives (shadcn), tables (TanStack), charts (Recharts)
  lib/                 formatting (en-IN, INR lakh/crore), shared zod schemas
tests/                 vitest (domain + services), playwright (flows)
docs/
  BUILD-LOG.md         one entry per completed task
  PONYTAIL-DEBT.md     ledger of deliberate shortcuts (ceiling + upgrade path)
AGENTS.md              ponytail ruleset (always-on for agents in this repo)
```

### 3.5 Conventions

- Money stored as integer paise. Percentages stored as numeric.
- Soft-delete (`deleted_at`) on all financial and relationship tables. Hard delete never
  exposed. Financial records are never permanently deleted.
- Every mutating service writes an `audit_log` row via a `withAudit()` wrapper.

### 3.6 Future-proofing (spec section 58)

Core tables carry a nullable `org_id` (super stockist) and `brand_id` (manufacturer),
each seeded to one row. No tenant UI is built. Multi-territory / multi-stockist /
multi-brand is additive later — no rewrite.

---

## 4. Data model

Money columns are integer paise. All tables carry `id`, `created_at`, `updated_at`,
`org_id`; relationship/financial tables also carry `deleted_at`.

### 4.1 Identity, org, territory, targets

- **`orgs`** — super stockist. One seeded row ("Bangalore East Super Stockist").
- **`brands`** — manufacturer. One seeded row ("Farm & Farmers"); holds `gstin`,
  `billing_state` (Rajasthan).
- **`users`** — `id` = Supabase auth uid, `email`, `name`, `role` (`OWNER` / `SALES`),
  `status`, optional `employee_id`.
- **`employees`** — `name`, `phone`, `joining_date`, `status`, optional `user_id` (an
  employee record can exist before a login is provisioned).
- **`territories`** — `name`, `type` (`ZONE` / `AREA` / `NEIGHBORHOOD` / `PINCODE`),
  `parent_id` (self-referential hierarchy), `estimated_market_potential` (paise),
  `estimated_distributor_count`, `active`. All editable; Whitefield, Marathahalli, KR
  Puram etc. are seed rows only, nothing hardcoded.
- **`territory_assignments`** — territory <-> employee, `from_date`, `to_date` (nullable).
- **`targets`** (spec section 45) — `scope` (`EMPLOYEE` / `ORG`), optional `employee_id`,
  `period_month` (first of month), `metric` enum (`new_leads`, `qualified_leads`,
  `meetings`, `quotations`, `new_distributors`, `first_orders`, `repeat_orders`,
  `sales_value`, `active_distributors`), `target_value`. Editable in Settings.

### 4.2 Cross-cutting tables

- **`audit_log`** — `user_id`, `entity_type`, `entity_id`, `action`, `old_values` (jsonb),
  `new_values` (jsonb), `created_at`.
- **`notifications`** — `severity` (`critical` / `attention` / `positive`), `category`,
  `title`, `body`, `entity_type`, `entity_id`, `target_user_id` (nullable = all),
  `read_at`.
- **`app_config`** — `key` -> `value` (jsonb). Holds: expiry thresholds (90/60/30),
  slow-moving days, distributor-score weights, credit-utilization thresholds (80/100),
  price-approval bands, pricing recommendation bands, `billing_direction`,
  `prices_gst_inclusive` (true), stage -> default-probability map, hot-lead probability
  threshold, distributor A/B/C thresholds, reorder cadence days.

### 4.3 Distributor CRM

- **`distributor_leads`** (spec section 8):
  - *Basic:* `business_name`, `contact_person`, `phone`, `email`, `address`,
    `territory_id`, `pincode`, `location` (maps URL / text), `existing_business_type`,
    `years_in_business`.
  - *Commercial:* `current_categories` (jsonb), `existing_dryfruit_brands`,
    `existing_seed_brands`, `existing_flour_brands` (text), `approx_monthly_turnover`,
    `estimated_category_turnover`, `expected_ff_monthly_potential`,
    `working_capital_capability`, `expected_credit_requirement` (paise).
  - *Infrastructure:* `warehouse` (bool/text), `delivery_vehicles` (int), `salesmen`
    (int), `retailer_network` (int estimate), `geographic_coverage` (text).
  - *Qualification:* `score_inputs` (jsonb, nine sub-scores), computed `score` (0-100),
    `grade` (`A` >=80 / `B` 65-79 / `C` 50-64 / `REJECT` <50). Weights from `app_config`;
    recomputed on save.
  - *Pipeline:* `stage` (enum, 14 values below), `probability` (int %),
    `assigned_employee_id`, `next_follow_up_at`, `converted_distributor_id` (nullable),
    `lost_reason` (enum) + `lost_notes`, `on_hold_reason`.
  - **Stages:** `IDENTIFIED`, `CONTACTED`, `QUALIFIED`, `MEETING_SCHEDULED`,
    `PRESENTATION_DONE`, `COMMERCIAL_DISCUSSION`, `NEGOTIATION`, `APPROVED`, `APPOINTED`,
    `FIRST_ORDER`, `ACTIVATED`, `REPEAT_ORDER`, `LOST`, `ON_HOLD`. The dashboard funnel
    (spec section 6) is a grouped view over these, mapped in the KPI layer.
  - Changing `stage` sets `probability` to the `app_config` default for that stage unless
    it was manually overridden. `lost_reason` (12-value enum, spec section 47) is required
    when moving to `LOST`.

- **`activities`** (spec section 10) — immutable timeline (soft-delete only, short edit
  window, audit-logged). `lead_id` **or** `distributor_id` (one required), `employee_id`,
  `type` (`CALL`, `WHATSAPP`, `MEETING`, `PRESENTATION`, `SAMPLE`, `QUOTATION`,
  `NEGOTIATION`, `FOLLOW_UP`, `ORDER`, `PAYMENT_DISCUSSION`, `COMPLAINT`, `OTHER`),
  `occurred_at`, `notes`, `outcome`, `next_action`, `next_follow_up_at`.

- **"Next follow-up" — three roles, no duplication:**
  - `activities.next_follow_up_at` — historical: what was planned at that touchpoint.
    Never mutated.
  - `distributor_leads.next_follow_up_at` — the single current source of truth. Updated by
    the newest activity or a manual edit. The Follow-up Engine reads only this.
  - `tasks` — explicit to-do items only.

- **`tasks`** (spec section 7) — `title`, `type` (`FOLLOW_UP`, `MEETING`, `CALL`,
  `QUOTATION_CHASE`, `DISTRIBUTOR_REVIEW`, `REORDER_NUDGE`, `COLLECTION`, `OTHER`),
  optional `lead_id` / `distributor_id`, `priority` (`CRITICAL` / `HIGH` / `NORMAL` /
  `LOW`), `due_date`, `assigned_employee_id`, `status` (`PENDING` / `IN_PROGRESS` /
  `COMPLETED` / `CANCELLED`), `completed_at`, `source` (`MANUAL` / `AUTO`).
  - **Today's Tasks screen = union of** open `tasks` rows **and** leads whose
    `next_follow_up_at <= today`. A due follow-up does not spawn a task row.
  - Leads with no `next_follow_up_at` and stage not in (`LOST`, `ON_HOLD`, `REPEAT_ORDER`)
    are flagged. A hot lead (grade `A` or probability >= config threshold) with no next
    action is a **critical** flag.

- **`distributor_daily_reports`** / **`employee_daily_reports`** (spec section 22) — one
  row per employee per date: `areas_visited` (jsonb), `notes`, `blockers`, `submitted_at`.
  All activity/outcome counts are **derived** from `activities` / `tasks` / `orders` /
  `quotations`, not stored here.

### 4.4 Distributor master

- **`distributors`** (spec section 12) — `business_name`, `contact`, `address`,
  `territory_id`, `exclusive` (bool), `assigned_employee_id`, `appointment_date`,
  `status` (`PROSPECT` / `APPROVED` / `ACTIVE` / `TEMP_INACTIVE` / `SUSPENDED` /
  `CLOSED`), `grade` (A/B/C), `credit_limit` (paise), `credit_days`, `payment_terms`,
  `expected_monthly_purchase`, `product_categories` (jsonb), `review_date`,
  `agreement_status`, `source_lead_id`.
- **Territory exclusivity conflict (spec section 13, Rule):** assigning a territory that
  equals, contains, or sits under a territory already held exclusively by another active
  distributor raises a **blocking** alert the owner can override (recorded).

### 4.5 Products and pricing

- **`categories`** — self-referential (category -> subcategory), editable. Seed (from the
  real F&F sheet): **Dry Fruits, Seeds, Flours, Spices, Other / Extra Products**.
- **`products`** (SKU master) — one row per product x pack. `sku_code` (unique — Rule),
  `name`, `category_id`, `brand_id`, `pack_size` (grams; 100/250/500/1000 for jar
  categories, 1000 for flours, from the "Variation" string for extras), `unit`
  (`G` / `KG` / `PC`), `mrp` (nullable — 1 kg packs have none in the sheet), `gst_pct`,
  `shelf_life_days`, `reorder_level`, `min_stock`, `max_stock`, `preferred_stock`,
  `active`, `volatile_price` (bool — Almond, Cashew, Pista, Pumpkin Seeds). Soft-delete.
- **`product_prices`** (1:1 with product, current values only):
  - `mrp` — nullable, from the sheet.
  - `ss_billing_price` — the sheet's "Current" value (GST-inclusive, ex-Jaipur). Sanjay's
    cost basis before inbound freight.
  - `distributor_price`, `floor_price`, `target_price` — Sanjay sets these (seeded from a
    documented markup on `ss_billing_price`: floor +8%, distributor +12%, target +18%;
    each row tagged `is_demo_assumption = true` until replaced).
  - `retailer_price` — optional, derived from MRP.
  - `manual_override` (bool) + who/when — set when a value is edited away from the
    recommendation. Audit-logged.
  - **Dropped from the spec's field list:** `manufacturer_price` (F&F's own cost —
    unknowable, not Sanjay's concern) and `strategic_price` (YAGNI). See Ponytail-debt.
  - **No `PriceList` / `PriceRule`.** One global price set per SKU. See Ponytail-debt.
- **`app_config.prices_gst_inclusive = true`.** The pricing calculator backs out taxable
  value (`price / (1 + gst_pct/100)`) for margin math and shows both inclusive and
  ex-GST. `gst_pct` seeded with category defaults (Dry Fruits 12%; Seeds / Flours /
  Spices 5%), editable, flagged "confirm with F&F".

### 4.6 Quotations, price approval, schemes

- **`quotations`** — lead **or** distributor, `employee_id`, `quote_date`,
  `valid_until` (Rule 5 — required), `status` (`DRAFT` / `SENT` / `ACCEPTED` /
  `REJECTED` / `EXPIRED`), `notes`.
- **`quotation_items`** — `product_id`, `qty`, `requested_rate`, snapshots of `list_rate`
  and `floor_rate` at quote time, `scheme_id`, `discount`, `gst_pct`, computed
  `net_amount`.
- **Price approval (spec section 16)** — per item on submit:
  - `requested_rate >= target_price` -> auto-approved.
  - `floor_price <= requested_rate < target_price` -> admin approval (config toggle).
  - `requested_rate < floor_price` -> blocked unless admin override.
  - **`price_approvals`** — `requested_rate`, `original_rate`, `reason`, `requested_by`,
    `approver_id`, `decision` (`PENDING` / `APPROVED` / `REJECTED`), `decided_at`.
    Audit-logged.
- **`schemes`** (spec section 30) — `name`, `type` (`FLAT_DISCOUNT`, `QTY_SCHEME`,
  `BUY_X_GET_Y`, `DISTRIBUTOR_INCENTIVE`, `LAUNCH`, `MONTHLY_TARGET_INCENTIVE`), scope
  (`product_id` / `category_id` / all), `start_date`, `end_date`, `min_qty`, `min_value`,
  `benefit` (jsonb), `eligibility` (jsonb, e.g. distributor grade), `requires_approval`,
  `active`.
- **`scheme_applications`** — `scheme_id`, `order_id` / `quotation_id`, `distributor_id`,
  computed **actual benefit (paise)**, `applied_at`. Feeds contribution and scheme-cost
  reporting.
- Milestone 2 ships `FLAT_DISCOUNT` + `QTY_SCHEME` + `DISTRIBUTOR_INCENTIVE`.
  `BUY_X_GET_Y` and target-incentive slabs are Phase 2/3.

### 4.7 Orders, manufacturer invoices, inventory (Phase 2)

The three concepts are deliberately distinct — linked, never the same event (spec
section 17).

- **`orders`** (internal demand) — `distributor_id`, `order_date`, `employee_id`,
  `status` (`DRAFT` -> `CONFIRMED` -> `SENT_TO_FF` -> `FF_CONFIRMED` -> `INVOICED` ->
  `DISPATCHED` -> `DELIVERED`, + `CANCELLED`), `notes`.
- **`order_items`** — `product_id`, `qty`, `rate`, `discount`, `scheme_id`, `gst_pct`,
  `net_amount`.
- **`manufacturer_invoices`** (billing-entity data) — `ff_invoice_number`,
  `invoice_date`, `distributor_id`, optional `order_id`, `invoice_amount`, `gst_amount`,
  `payment_status`, `billing_direction`. UI labels this section "Manufacturer / Billing
  Entity Data".
- **`inventory_batches`** — `product_id`, `batch_number`, `mfg_date`, `expiry_date`
  (must be after `mfg_date` — Rule), `qty_received`, cached `qty_available`,
  `warehouse_location`, `landed_cost_per_unit` (paise), `purchase_item_id`, `status`
  (`ACTIVE` / `EXHAUSTED` / `QUARANTINED`).
- **`inventory_transactions`** — immutable ledger. `product_id`, `batch_id`, `type`
  (`RECEIPT` / `ISSUE` / `DAMAGE` / `SAMPLE` / `ADJUSTMENT` / `RETURN`), signed `qty`,
  `ref_type` + `ref_id`, `occurred_at`, `cost_per_unit`, `notes`, `created_by`.
  Issued/damaged/sampled quantities are sums over this ledger.
- **`qty_committed`** = open `order_items` on orders in `CONFIRMED..FF_CONFIRMED` not yet
  issued (product-level; allocated to batches by FEFO at issue time).
- **Available = physical - committed** (spec section 18).
- **FEFO (Rule 7):** issue allocation consumes `ACTIVE` batches ordered by
  `expiry_date ASC, mfg_date ASC`, writing one `ISSUE` transaction per batch touched.
- **Committed stock cannot be issued to another distributor (Rule 8):** new-order
  confirmation checks `physical - committed` first and blocks otherwise (owner override
  recorded).

### 4.8 Purchases / stock-in (Phase 2)

- **`purchases`** (spec section 20) — `ff_reference`, `purchase_date`, `status`,
  `freight`, `other_charges`.
- **`purchase_items`** — `product_id`, `batch_number`, `mfg_date`, `expiry_date`, `qty`,
  `unit_cost` (default = `ss_billing_price`), allocated `freight` / `other`.
- **Landed cost per unit = unit_cost + (allocated freight + other direct costs) / qty.**
  Each line creates an `inventory_batch` + a `RECEIPT` transaction. Landed cost feeds
  pricing and profitability.

### 4.9 Receivables, collections, expenses (Phase 2)

- **`receivables`** + **`payments`** (spec section 21) — used when
  `billing_direction = FF_TO_SS` (SS carries the receivable): `distributor_id`,
  `source_invoice_ref`, `invoice_date`, `invoice_amount`, `due_date`, `amount_received`,
  computed `balance`, `status` (`NOT_DUE` / `DUE_SOON` / `DUE_TODAY` / `OVERDUE` /
  `PAID` / `PARTIALLY_PAID`).
- When `billing_direction = FF_TO_DISTRIBUTOR`, Collections is **read-only payment-status
  monitoring** mirrored from `manufacturer_invoices.payment_status` — no payment rows.
- **Credit utilization = outstanding / credit_limit.** Warnings at 80%, 100%, or any
  overdue (spec section 21).
- **`expenses`** (spec section 29) — `expense_date`, `category` (`EMPLOYEE`, `TRAVEL`,
  `FUEL`, `WAREHOUSE`, `LOADING`, `FREIGHT`, `SAMPLES`, `MARKETING`,
  `DISTRIBUTOR_SCHEME`, `MISC`), `amount`, `description`, optional `distributor_id` /
  `territory_id` / `employee_id`, `is_fixed` (bool — variable vs fixed for the
  profitability split).

### 4.10 Distributor review (Phase 3)

- **`distributor_reviews`** (spec section 48) — `review_date`, `sales_target`,
  `actual_sales`, `reorder_frequency`, `payment_performance`, `territory_coverage`,
  `sku_coverage`, `decision` (`CONTINUE` / `SUPPORT` / `IMPROVE` / `WARNING` /
  `REPLACE` / `EXIT`).

---

## 5. Domain calculations

All are **pure functions in `src/domain/*`**, framework-free, each with a Vitest file
(ponytail's "one runnable check" rule). The service layer calls them; screens never inline
math.

### 5.1 Distributor score (spec section 8)

`scoreDistributor(inputs, weights)` — nine rated inputs (retailer network, category
experience, geo coverage, salesmen, delivery infra, working capital, brand portfolio,
reputation, willingness). Default weights sum to 100 (20/15/15/10/10/10/10/5/5); weights
from `app_config`, validated to sum to 100. Returns score 0-100 and grade A/B/C/REJECT.

### 5.2 Pricing calculator (spec section 15)

`computePricing(product, prices, costInputs, config)`:

- Waterfall display: MRP -> retailer margin -> distributor margin -> super-stockist margin
  -> manufacturer cost.
- Net contribution/unit = selling price - product cost - scheme - freight - loading -
  sales incentive - samples - other.
- Returns: gross margin (paise and %), net contribution (paise and %), max permissible
  discount (= selling price - floor price).
- `product cost` input = weighted-average landed cost of available batches when inventory
  exists (ties to Section 4.8), else `ss_billing_price` + standard freight from config.
- Prices are GST-inclusive; the function also reports ex-GST taxable-value margins.
- **Hard guard:** never returns a price below `floor_price`; below-floor needs an explicit
  admin override flag.

### 5.3 Price recommendation engine (Q&A addition)

`recommendPricing(sku, { ssBillingPrice | landedCost, mrp, gstPct, bands })` -> recommended
`floor_price`, `distributor_price`, `target_price`, `retailer_price`, an **MRP suggestion**
for 1 kg packs with none, plus a **`rationale[]`** of plain-language reasons and the margin
outcome at each point.

Bands (in `app_config`, editable in Settings, optional per-category override):

| Band | Default | Drives |
|---|---|---|
| `ss_min_margin_pct` | 8% | floor price = cost x 1.08 ("below this needs admin override") |
| `ss_normal_margin_pct` | 12% | distributor price |
| `ss_target_margin_pct` | 18% | target price (standard goal) |
| `distributor_margin_pct` | 15% | back-calc retailer price (PTR) from distributor price |
| `retailer_margin_pct` | 25% | checked against MRP |

- `volatile_price` SKUs get a wider floor buffer (e.g. 12% not 8%); rationale notes it.
- **Chain sanity check** in the rationale: cost -> distributor price -> retailer price ->
  MRP. If MRP is too low to leave standard distributor + retailer margins above the
  recommended distributor price, it flags (e.g. "MRP only supports 21% retailer margin at
  this distributor price").
- The Pricing screen shows **recommended vs current side by side** with a "reset to
  recommended" action. Settings retunes bands and re-generates recommendations for all
  SKUs.

### 5.4 Pipeline (spec sections 9, 44)

- Weighted pipeline value per lead = expected F&F monthly potential x probability.
- Pipeline value = sum of potential (open stages). Weighted pipeline = sum of
  (potential x probability).
- Funnel conversion % between grouped stages = leads that reached stage N / leads that
  reached stage N-1.

### 5.5 Activation and conversion (spec sections 26, 44)

Over a date range + filters:

- Activation rate = distributors with >=1 order / appointed x 100.
- Repeat order rate = distributors with >=2 orders / distributors with >=1 order x 100.
- Lead conversion = appointed / qualified leads x 100.
- Employee conversion = new distributors / qualified leads (per employee).

### 5.6 Distributor performance (spec section 25)

Per active distributor per period: monthly sales, order count, AOV, active-SKU count,
repeat frequency, last order date, days since last order, target, achievement %,
outstanding, credit utilization, N-month trend series. A/B/C classification from
configurable thresholds (repeat consistency + target achievement). Rule 2: "Productive"
only after a repeat order — a classification rule in this layer.

### 5.7 Employee scorecard (spec sections 22-24, 46)

Three blocks, **kept separate, never summed into one number**:

- *Activity:* calls, meaningful conversations, meetings, presentations, follow-ups
  completed, quotations.
- *Funnel outcome:* new leads, qualified leads, negotiations, appointments, first orders.
- *Revenue outcome:* order value, repeat orders, gross profit, pipeline value created.

Counts derived from `activities` / `tasks` / `orders` / `quotations` for the
employee+date. Weekly review = same metrics, this week vs last week.

### 5.8 Profitability waterfall (spec section 28)

Gross Margin and Operating Profit shown separately, never conflated:

```
Revenue            sum order_items net (delivered/invoiced)
- Product Cost     sum qty x FEFO landed cost
= Gross Profit     -> Gross Margin %
- Freight
- Schemes          sum scheme_applications benefit (paise)
- Sales Incentives
- Samples          SAMPLE issues @ landed cost + SAMPLES expense
- Other Variable   expenses where is_fixed = false
= Contribution     -> Contribution Margin %
- Fixed Expenses   expenses where is_fixed = true
= Operating Profit
```

### 5.9 Inventory KPIs (spec section 44)

Stock turnover = COGS / average inventory. Inventory days = average inventory / COGS x
days. Inventory value = sum(qty_available x landed cost). Plus committed value and
near-expiry value.

---

## 6. Screens and navigation

### 6.1 Navigation (spec section 5)

14 items: Dashboard, Today's Tasks, Distributor Pipeline, Distributors, Territories,
Products & Pricing, Orders, Inventory, Purchases / Stock In, Collections, Employee
Activity, Schemes & Discounts, Reports, Settings.

Role-aware. Desktop: left sidebar. Mobile: bottom nav with the field set (Today's Tasks,
Pipeline, Distributors, Quotations, +More). `SALES` sees no cost prices, no Inventory
financials, no Collections, no Settings, no org financials — enforced server-side.

### 6.2 Command Center (spec section 55) — owner home

One component with a `mode` (`morning` / `eod`); spec sections 34-35 are not separate
screens. Six blocks:

| Block | Shows |
|---|---|
| What happened? | Yesterday: sales (paise), orders, activity counts |
| What is happening? | Today: meetings, follow-ups due, orders in, open quotations |
| What will happen? | Weighted pipeline, hot deals, expected orders (7 / 30 d) |
| What needs my attention? | **Critical only**, each with a one-click action: overdue payments, stock-outs, below-floor requests, near-expiry, hot lead with no next action, exclusivity conflict, missing daily report |
| Where is my money? | Inventory value, committed value, outstanding, overdue |
| Where is my growth? | New distributors MTD, activation rate, repeat rate, territory coverage % |

EOD mode swaps in "Today's Result" + "Tomorrow: 3 priorities, follow-ups,
inventory/collection actions". Principle (spec section 34): decisions, not raw data.

### 6.3 Other screens

- **Executive Dashboard** (spec section 6) — 10 KPI cards, distributor funnel with
  conversion %, Today block, sales charts (daily/weekly/monthly, distributor/category/SKU),
  inventory alerts, distributor health.
- **Today's Tasks** (spec section 7) — the union view from Section 4.3, grouped
  Overdue / Today / Next-7, with quick actions (log activity, reschedule, complete).
- **Distributor Pipeline** — Kanban over the 14 stages; card shows name, area, potential
  monthly value, qualification score, stage, probability, next follow-up, assigned
  employee; column headers show weighted pipeline value.
- **Reports** (spec sections 27, 36) — parameterised (date range + global filters): sales
  cuts (daily/weekly/monthly/distributor/territory/SKU/category/pack), gross margin,
  contribution, AOV, repeat rate, loss-reason analysis, employee activity vs outcome,
  and the Monthly Business Review composite. All CSV/Excel export.
- **Settings** — bands, thresholds, targets, score weights, categories, config toggles,
  purge demo data.

### 6.4 Global filters (spec section 42)

Date range, territory, area, distributor, employee, category, SKU. Persist in the session
via URL search params + `sessionStorage`, surviving navigation.

---

## 7. Alerts / notification engine (spec sections 32-33)

One service `runAlertScan()`, hit by a **Cloudflare Cron Trigger** (`/api/cron/alerts`,
shared-secret header) nightly + a lighter midday pass. Scans:

- follow-ups due / overdue
- quotations awaiting response past N days
- distributor appointment review due
- reorder-due distributors (days since last order > cadence)
- payments due / overdue
- stock below reorder level
- near-expiry (90 / 60 / 30 -> warning / urgent / critical)
- inactive distributors
- territories with zero distributors
- employees with no daily report submitted

Writes `notifications` rows (deduped by entity + category + day) with severity, and
optional `AUTO` tasks for the assigned employee. **Positive events** (new distributor,
first order, repeat order, target achieved) are emitted inline by the owning service at
the moment they happen, not by the scan.

**Notification Center** — bell panel, grouped by severity (critical / attention /
positive), mark-read, deep-links to the entity.

---

## 8. Cross-cutting

- **Audit (spec section 38)** — `withAudit()` wrapper on mutating services; mandatory for
  price/cost/floor changes, credit-limit changes, territory changes, order modifications,
  inventory adjustments, payment edits, approval actions. Captures user, action, old/new
  JSON, timestamp.
- **Validation (spec section 39)** — shared Zod schemas (`src/lib/schemas`), client +
  server: SKU unique, Indian 10-digit phone, qty > 0, no negative stock (block issue
  beyond available unless override), price < floor -> approval, credit limit >= 0,
  expiry > mfg, valid due dates.
- **Business rules (spec section 43)** — enforced in services:
  1. Distributor cannot be `ACTIVE` without appointment information.
  2. "Productive" only after a repeat order (KPI-layer classification).
  3. Every `ACTIVE` distributor must have territory + credit terms + target + assigned
     employee.
  4. Every lead must have a next action (flagged, not blocked).
  5. Every quotation must have `valid_until`.
  6. Selling below floor price requires approval.
  7. Inventory uses FEFO.
  8. Committed stock cannot be sold to another distributor.
  9. Overdue distributor accounts trigger alerts.
  10. Inactive distributors appear in the owner's attention list.
- **Import / Export (spec section 40)** — CSV/Excel import for products, price list, leads,
  distributors, opening stock, with a **dry-run preview + row-level error report**.
  Exports for sales, inventory, distributors, pipeline, employee activity, receivables,
  profitability. SheetJS in a Route Handler.
- **Seed data (spec sections 49-50)** — real F&F catalogue + prices as **live** data;
  faker-generated DEMO transactional data (~20 leads across stages, 5 distributors, sample
  activities/tasks, and — from Phase 2 — orders/batches/payments/expenses). Every demo row
  carries an `is_demo` marker; a "Demo data" banner shows while any exist; Settings has a
  "purge demo data" action.
- **Security (spec section 51)** — Supabase Auth, `can()` on every action, server-side
  field filtering (no cost/financials to `SALES`), cron endpoint secret, audit log, Zod
  on every mutation, protected routes.
- **Performance (spec section 52)** — indexes on FK/status/date columns, keyset pagination
  everywhere, server-side filtering/sorting, KPI queries as SQL aggregates (not row
  loads), nightly-materialised scorecards + notifications, charts fed pre-aggregated
  series.

---

## 9. Build phasing

### Milestone 1 — Field CRM (first usable version)

Scaffold (Next.js 15 + OpenNext/Cloudflare + Drizzle + Supabase Auth + Tailwind +
shadcn/ui) -> identity / territory / CRM schema -> auth + permission matrix -> Territories
-> Leads + scoring -> Pipeline Kanban -> Activities -> Follow-up engine -> Tasks / Today
-> Daily report -> seed -> deploy to Cloudflare.

### Milestone 2 — Masters and pricing

Categories / Products / `product_prices` + real-catalogue import -> Pricing Calculator +
recommendation engine -> Distributor Master + lead->distributor conversion -> Quotations +
price approval -> Schemes (basic) -> Settings (bands, thresholds, targets, weights).

### Milestone 3 — Command Center (completes spec Phase 1)

Command Center (morning / eod) -> Executive Dashboard -> Employee scorecards + weekly
review -> Reports + Monthly Business Review -> Notification Center + alert-scan cron ->
global filters -> CSV/Excel exports.

### Phase 2

Orders -> Manufacturer Invoices -> Inventory + batches + FEFO -> Purchases / Stock-In ->
Receivables / Collections -> Expenses -> inventory alerts in the scan.

### Phase 3

Advanced Profitability Dashboard -> full Sales Analytics -> territory / market-coverage
analytics -> distributor reviews / exit -> forecasting -> remaining entity imports.

### Definition of Done (every task)

Tests green - BUILD-LOG entry written - PONYTAIL-DEBT ledger updated - ponytail-review
self-check on the diff - focused commit. Verify the app actually runs before moving on.

---

## 10. Testing

- **Vitest** for all of `src/domain` (scoring, pricing, recommendation, KPIs,
  profitability, FEFO) and critical services.
- **Playwright** for: login + RBAC; create lead -> move through pipeline -> convert to
  distributor; create quotation -> price approval; record purchase -> stock-in -> order ->
  FEFO issue; Command Center renders with seed data.

---

## 11. Ponytail-debt items (accepted at design time)

| Item | Ceiling | Upgrade path |
|---|---|---|
| No `PriceList` / `PriceRule` — one global price set per SKU | No per-grade or per-territory pricing | Add `price_list_id` scope column + resolver |
| Dropped `manufacturer_price`, `strategic_price` | Waterfall bottoms out at `ss_billing_price` | Re-add columns if F&F ever shares cost / a strategic price is needed |
| Seeded `distributor_price` / `floor_price` / `target_price` from a fixed markup | DEMO assumption, not real margins | Owner enters real figures in Pricing screen; `is_demo_assumption` flag clears |
| Permission matrix in code, no per-user overrides | Role-level only | Migration to a `permissions` table |
| Command Center KPIs partly materialised nightly | Up to ~24 h stale for heavy aggregates | Move to incremental refresh or a materialised view |
| Commission-% revenue path is a config stub | Only buy-sell spread computes | Implement commission branch in pricing + profitability |

---

## 12. Open items

- **GST slabs per category** — seeded defaults (Dry Fruits 12%; Seeds / Flours / Spices
  5%). Confirm actual slabs with F&F / a CA; adjust `gst_pct` seed.
- **`billing_direction` default** — set to `FF_TO_DISTRIBUTOR` (Option 1). Change in
  Settings if the finalised arrangement is Option 2.
- **1 kg pack MRP** — absent in the sheet. Recommendation engine suggests one; owner
  confirms or the pack is sold without a printed MRP.
- **F&F price volatility** — Almond, Cashew, Pista, Pumpkin Seeds flagged
  `volatile_price`; the recommendation engine applies a wider floor buffer and the alert
  scan can nudge for price review (Phase 3).

---

## 13. Deliverables (spec section 59)

Working application - database schema (Drizzle migrations) - seed/demo data - Supabase
Auth - role-based access - Command Center + Executive Dashboard - Distributor CRM -
employee management - inventory - orders - pricing + recommendation engine - receivables -
reports - notifications - audit logs - README - environment setup - migration instructions
- sample login credentials - implemented-features list - future-enhancements list.

---

## 14. Explicitly not built (spec section 57)

Full accounting, payroll, GST filing, HR, retailer billing, consumer e-commerce, loyalty
programs, AI chatbot, microservices, native mobile app, multi-country support.
