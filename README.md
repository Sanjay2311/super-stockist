# Super Stockist — Field CRM

Next.js 15 (App Router) Field CRM for a super stockist's sales team, deployed to
Cloudflare via the OpenNext adapter. Postgres + auth via Supabase; Drizzle ORM.

## Prerequisites

- Node 20+
- Docker (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Local setup

```bash
npm install
cp .env.example .env.local
supabase start          # local Postgres + auth on 127.0.0.1:54321/54322
npm run db:migrate      # apply Drizzle migrations
npm run db:seed         # base config + demo data (also loads the catalogue)
npm run db:seed:catalogue   # or load just the F&F catalogue (184 SKUs) on its own
npm run dev             # http://127.0.0.1:3000
```

`GET /api/health` returns `{ ok: true }` once the server is up.

The catalogue is real Farm & Farmers data (184 SKUs, real Current/MRP prices,
GST-inclusive). The `distributor` / `floor` / `target` prices are band-derived from
the default pricing bands (flagged `is_demo_assumption` on each `product_prices`
row) until the owner sets them on the Products & Pricing screen.

If you already run a Postgres 16 instance locally, point `DATABASE_URL` /
`TEST_DATABASE_URL` at it instead of using `supabase start`.

## Testing

```bash
npm test                # Vitest unit tests (domain + services)
npm run e2e              # Playwright end-to-end tests
```

## Deploy

Cloudflare Workers via OpenNext (`npm run cf:build` / `npm run cf:deploy`).
Full deploy instructions are filled in Task 20.
