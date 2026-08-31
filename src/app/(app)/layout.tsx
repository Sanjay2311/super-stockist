import { requireUser } from '@/server/auth/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();               // redirects to /login when unauthenticated
  return <div className="min-h-dvh">{children}</div>;   // nav added in Task 7
}
