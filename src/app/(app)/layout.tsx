import { requireUser } from '@/server/auth/session';
import { signOut } from '@/app/(auth)/login/actions';
import { hasDemoData } from '@/server/db/seed';
import { AppNav } from '@/components/app-nav';
import { listNotifications, unreadCount } from '@/server/services/notification';
import { NotificationBell } from '@/components/notification-bell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [demoLoaded, notifications, unread] = await Promise.all([
    hasDemoData(user.orgId),
    // Raised from 20 to 100 so the visible panel list is roughly consistent with
    // `unreadCount`'s cap of 999 — a full redesign of retention/pagination is
    // deliberately out of scope for this fix wave (see PONYTAIL-DEBT).
    listNotifications(user, { limit: 100 }),
    unreadCount(user),
  ]);
  return (
    <div className="flex min-h-dvh">
      <AppNav user={user} />
      <div className="flex-1 pb-16 md:pb-0">
        {demoLoaded && (
          <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-800 print:hidden">
            Demo data is loaded — purge it from Settings before real use.
          </div>
        )}
        <header className="flex items-center justify-between border-b px-4 py-2 text-sm print:hidden">
          <span className="text-neutral-500">
            {user.name} · {user.role}
          </span>
          <NotificationBell notifications={notifications} unread={unread} />
          <form action={signOut}>
            <button className="text-neutral-500 hover:text-neutral-900">Sign out</button>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}
