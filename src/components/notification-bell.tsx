'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { NotificationRow } from '@/server/services/notification';
import { markReadAction } from '@/app/(app)/notifications/actions';

const SEVERITY_BADGE: Record<NotificationRow['severity'], string> = {
  critical: 'bg-red-100 text-red-800',
  attention: 'bg-amber-100 text-amber-800',
  positive: 'bg-green-100 text-green-800',
};

const SEVERITY_LABEL: Record<NotificationRow['severity'], string> = {
  critical: 'Critical',
  attention: 'Attention',
  positive: 'Positive',
};

const SEVERITY_ORDER: NotificationRow['severity'][] = ['critical', 'attention', 'positive'];

const ENTITY_LINK: Record<string, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  distributor: (id) => `/distributors/${id}`,
  quotation: (id) => `/quotations/${id}`,
};

function NotificationRowView({ n, onNavigate }: { n: NotificationRow; onNavigate: () => void }) {
  const href = ENTITY_LINK[n.entityType]?.(n.entityId);
  const isUnread = n.readAt == null;

  const content = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_BADGE[n.severity]}`}
        >
          {n.severity}
        </span>
        <span className="text-sm font-medium text-neutral-900">{n.title}</span>
      </div>
      {n.body && <p className="mt-0.5 text-xs text-neutral-500">{n.body}</p>}
    </>
  );

  return (
    <li className={`border-b px-3 py-2 last:border-b-0 ${isUnread ? '' : 'opacity-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} onClick={onNavigate} className="block hover:underline">
              {content}
            </Link>
          ) : (
            <div>{content}</div>
          )}
        </div>
        {isUnread && (
          <form action={markReadAction.bind(null, n.id)}>
            <button
              type="submit"
              className="shrink-0 text-xs text-neutral-500 hover:text-neutral-900"
            >
              Mark read
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationRow[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);

  const groups = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: notifications.filter((n) => n.severity === severity),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Notifications"
        className="relative rounded px-2 py-1 text-neutral-500 hover:text-neutral-900"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <button
          type="button"
          aria-label="Close notifications"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-black/20"
        />
      )}
      {open && (
        <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-white shadow-lg">
          {groups.length === 0 ? (
            <p className="px-3 py-4 text-sm text-neutral-500">No notifications.</p>
          ) : (
            groups.map((g) => (
              <div key={g.severity}>
                <div className="bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600">
                  {SEVERITY_LABEL[g.severity]}
                </div>
                <ul>
                  {g.items.map((n) => (
                    <NotificationRowView key={n.id} n={n} onNavigate={() => setOpen(false)} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
