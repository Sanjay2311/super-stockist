export function StageBadge({ stage }: { stage: string }) {
  const label = stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{label}</span>;
}
