'use client';
import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null as null | { error: string });
  return (
    <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <label className="block text-sm">Email
        <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="block text-sm">Password
        <input name="password" type="password" required className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-neutral-900 py-2 text-sm text-white disabled:opacity-50">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
