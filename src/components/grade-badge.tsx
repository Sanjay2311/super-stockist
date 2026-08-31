const CLASS: Record<string, string> = {
  A: 'bg-green-100 text-green-800', B: 'bg-blue-100 text-blue-800',
  C: 'bg-amber-100 text-amber-800', REJECT: 'bg-neutral-200 text-neutral-600',
};
export function GradeBadge({ grade }: { grade: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CLASS[grade] ?? CLASS.REJECT}`}>{grade}</span>;
}
