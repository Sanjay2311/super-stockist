import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { listDistributors } from '@/server/services/distributor';
import { listLeads } from '@/server/services/lead';
import { listProducts, redactProducts } from '@/server/services/product';
import { OPEN_STAGES } from '@/domain/pipeline';
import { createQuotationAction } from '../actions';
import { QuoteBuilder } from './quote-builder';

export default async function NewQuotationPage() {
  const user = await requireUser();
  if (!can(user, 'quotation.create')) redirect('/');

  const [distributors, allLeads, productsRaw] = await Promise.all([
    listDistributors(user.orgId),
    listLeads(user.orgId, { limit: 1000 }),
    listProducts(user.orgId, { limit: 1000, activeOnly: true }),
  ]);

  const activeDistributors = distributors.filter(
    (d) => d.status === 'ACTIVE' || d.status === 'APPROVED',
  );
  const openLeads = allLeads.filter((l) => (OPEN_STAGES as string[]).includes(l.stage));

  // redacted: SALES gets name + distributor price only (no floor/target).
  const products = redactProducts(user, productsRaw).map((p) => ({
    id: p.id,
    name: p.name,
    rate: p.price?.distributorPrice ?? 0,
  }));

  return (
    <main className="max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">New quotation</h1>
      <QuoteBuilder
        distributors={activeDistributors.map((d) => ({ id: d.id, name: d.businessName }))}
        leads={openLeads.map((l) => ({ id: l.id, name: l.businessName }))}
        products={products}
        action={createQuotationAction}
      />
    </main>
  );
}
