'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent,
} from '@dnd-kit/core';
import { moveLeadAction } from './actions';
import { formatINR } from '@/domain/money';
import { weightedPipelineValue, type LeadStage } from '@/domain/pipeline';
import type { BoardLead } from '@/server/services/lead';

export type { BoardLead };

const label = (stage: LeadStage) => stage.replace(/_/g, ' ');
const isOverdue = (iso: string | null) => !iso || new Date(iso).getTime() < Date.now();

function Card({ lead }: { lead: BoardLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded border bg-white p-2 text-xs shadow-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <Link href={`/leads/${lead.id}`} className="font-medium text-blue-700 hover:underline">
        {lead.businessName}
      </Link>
      <div className="text-neutral-500">{lead.territoryName ?? '—'}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-neutral-600">
        <span>{formatINR(lead.expectedFfMonthlyPotential)}</span>
        <span>{lead.score} · {lead.grade}</span>
        <span>{lead.probability}%</span>
      </div>
      <div className={isOverdue(lead.nextFollowUpAt) ? 'text-red-600' : 'text-neutral-500'}>
        {lead.nextFollowUpAt
          ? `follow-up ${new Date(lead.nextFollowUpAt).toLocaleDateString('en-IN')}`
          : 'no follow-up'}
      </div>
      <div className="text-neutral-400">{lead.assignee ?? 'Unassigned'}</div>
    </li>
  );
}

function Column({ stage, leads }: { stage: LeadStage; leads: BoardLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const weighted = leads.reduce(
    (sum, l) => sum + weightedPipelineValue(l.expectedFfMonthlyPotential, l.probability),
    0,
  );
  return (
    <section
      ref={setNodeRef}
      aria-label={label(stage)}
      data-stage={stage}
      className={`flex min-w-[220px] shrink-0 flex-col rounded border bg-neutral-50 p-2 ${
        isOver ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <header className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-xs font-semibold uppercase text-neutral-600">{label(stage)}</span>
        <span className="text-[11px] text-neutral-400">{leads.length} · {formatINR(weighted)}</span>
      </header>
      <ul className="space-y-2">
        {leads.map((l) => <Card key={l.id} lead={l} />)}
      </ul>
    </section>
  );
}

export function Board({ stages, leads }: { stages: LeadStage[]; leads: BoardLead[] }) {
  const router = useRouter();
  // ponytail: local board state seeds from `leads` once and is kept in sync only by the
  // optimistic drag handler. Ceiling: an external change (another user restages a lead,
  // a new lead created elsewhere) is not reflected until a full page reload — the
  // post-move `revalidatePath` refreshes the RSC payload but this `useState` keeps its
  // value. Upgrade path: `useEffect(() => setItems(leads), [leads])` or a keyed remount.
  const [items, setItems] = useState(leads);
  // distance constraint so a plain click still reaches the card's <Link>.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id);
    const target = e.over?.id as LeadStage | undefined;
    if (!target) return;
    const current = items.find((l) => l.id === leadId);
    if (!current || current.stage === target) return;

    const prev = items;
    setItems((xs) => xs.map((l) => (l.id === leadId ? { ...l, stage: target } : l)));
    const res = await moveLeadAction(leadId, target);
    if ('error' in res) {
      setItems(prev);
      if (res.error === 'open-detail') router.push(`/leads/${leadId}`);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <Column key={stage} stage={stage} leads={items.filter((l) => l.stage === stage)} />
        ))}
      </div>
    </DndContext>
  );
}
