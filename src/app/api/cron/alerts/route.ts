import { listOrgs } from '@/server/services/org';
import { runAlertScan } from '@/server/services/notification';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const allOrgs = await listOrgs();
  let created = 0;
  for (const o of allOrgs) {
    created += (await runAlertScan(o.id)).created;
  }
  return Response.json({ ok: true, created });
}
