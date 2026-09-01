import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { getTodayView } from '@/server/services/task';
import { TASK_TYPES } from '@/lib/schemas';
import { addTask, finishTask } from './actions';

export default async function TodayPage() {
  const user = await requireUser();
  const scope = user.role === 'SALES' && user.employeeId ? { assignedEmployeeId: user.employeeId } : {};
  const view = await getTodayView(user.orgId, scope);

  const TaskList = ({ label, items }: { label: string; items: typeof view.tasks.overdue }) => (
    <div>
      <h3 className="text-sm font-semibold text-neutral-600">{label} ({items.length})</h3>
      <ul className="mt-1 space-y-1">
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>{t.title} <span className="text-neutral-400">· {t.type} · due {t.dueDate}</span></span>
            <form action={finishTask.bind(null, t.id)}><button className="text-xs text-blue-700 hover:underline">Done</button></form>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-neutral-400">Nothing here.</li>}
      </ul>
    </div>
  );

  const FollowUps = ({ label, items }: { label: string; items: typeof view.followUps.overdue }) => (
    <div>
      <h3 className="text-sm font-semibold text-neutral-600">{label} ({items.length})</h3>
      <ul className="mt-1 space-y-1">
        {items.map((l) => (
          <li key={l.id} className="rounded border px-3 py-2 text-sm">
            <Link href={`/leads/${l.id}`} className="text-blue-700 hover:underline">{l.businessName}</Link>
            <span className="text-neutral-400"> · {l.stage} · {l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleDateString('en-IN') : 'no date'}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-neutral-400">Nothing here.</li>}
      </ul>
    </div>
  );

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Today&apos;s Tasks</h1>
      <form action={addTask} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="text-sm">Task<input name="title" required className="mt-1 block rounded border px-2 py-1" /></label>
        <label className="text-sm">Type<select name="type" className="mt-1 block rounded border px-2 py-1">{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-sm">Due<input name="dueDate" type="date" required className="mt-1 block rounded border px-2 py-1" /></label>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Add</button>
      </form>
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="font-semibold">Tasks</h2>
          <TaskList label="Overdue" items={view.tasks.overdue} />
          <TaskList label="Today" items={view.tasks.today} />
          <TaskList label="Upcoming" items={view.tasks.upcoming} />
        </div>
        <div className="space-y-4">
          <h2 className="font-semibold">Follow-ups</h2>
          <FollowUps label="Overdue" items={view.followUps.overdue} />
          <FollowUps label="Today" items={view.followUps.today} />
          <FollowUps label="Next 7 days" items={view.followUps.next7} />
          <FollowUps label="Hot — no next action" items={view.followUps.hotNoAction} />
        </div>
      </section>
    </main>
  );
}
