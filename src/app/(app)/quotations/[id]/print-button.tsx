'use client';

// Triggers the browser's native print dialog. "Save as PDF" in that dialog's
// destination picker is the export path — no PDF-generation dependency needed
// for a document this simple.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
