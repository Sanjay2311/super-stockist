'use client';
import { useState } from 'react';

// Plain-text quote summary is assembled server-side and passed in; this button
// just drops it on the clipboard for pasting into WhatsApp.
export function CopyWhatsApp({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
      className="rounded border px-3 py-1.5 text-sm"
    >
      {done ? 'Copied' : 'Copy for WhatsApp'}
    </button>
  );
}
