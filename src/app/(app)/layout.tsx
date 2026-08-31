import { requireUser } from '@/server/auth/session';
import { signOut } from '@/app/(auth)/login/actions';
import { AppNav } from '@/components/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <AppNav user={user} />
      <div className="flex-1 pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b px-4 py-2 text-sm">
          <span className="text-neutral-500">
            {user.name} · {user.role}
          </span>
          <form action={signOut}>
            <button className="text-neutral-500 hover:text-neutral-900">Sign out</button>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}
