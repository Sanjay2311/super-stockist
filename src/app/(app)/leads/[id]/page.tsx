import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getLead } from '@/server/services/lead';

// Minimal placeholder so createLeadAction's redirect resolves. Task 13 builds the
// real lead detail screen.
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const lead = await getLead(user.orgId, id);
  if (!lead) notFound();
  return <main className="p-6"><h1 className="text-xl font-semibold">{lead.businessName}</h1></main>;
}
