import { db } from '@/server/db/client';
import { orgs } from '@/server/db/schema/identity';

/** All orgs in the system. Used by the cron alert-scan route, which has no
 *  AppUser (it's gated by CRON_SECRET, not assertCan) to iterate every org. */
export async function listOrgs(): Promise<{ id: string }[]> {
  return db.select({ id: orgs.id }).from(orgs);
}
