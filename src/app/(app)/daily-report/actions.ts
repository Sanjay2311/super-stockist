'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { submitReport } from '@/server/services/dailyReport';

export async function submitDailyReport(formData: FormData) {
  const user = await requireUser();
  const areasVisited = String(formData.get('areasVisited') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await submitReport(user, {
    reportDate: new Date(String(formData.get('reportDate') || new Date().toISOString().slice(0, 10))),
    areasVisited,
    notes: String(formData.get('notes') ?? ''),
    blockers: String(formData.get('blockers') ?? ''),
  });
  redirect('/daily-report?done=1');
}
