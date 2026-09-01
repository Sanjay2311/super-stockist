import { describe, it, expect } from 'vitest';
import { classifyFollowUp, isHotLead, needsNextAction } from '@/domain/followup';

const now = new Date('2026-08-31T09:00:00+05:30');

describe('followup domain', () => {
  it('classifies buckets relative to IST today', () => {
    expect(classifyFollowUp(null, now)).toBe('NONE');
    expect(classifyFollowUp(new Date('2026-08-30T18:00:00+05:30'), now)).toBe('OVERDUE');
    expect(classifyFollowUp(new Date('2026-08-31T20:00:00+05:30'), now)).toBe('TODAY');
    expect(classifyFollowUp(new Date('2026-09-03T10:00:00+05:30'), now)).toBe('UPCOMING');
  });
  it('flags hot leads by grade or probability', () => {
    expect(isHotLead({ grade: 'A', probability: 10, stage: 'QUALIFIED', hotThreshold: 60 })).toBe(true);
    expect(isHotLead({ grade: 'C', probability: 70, stage: 'NEGOTIATION', hotThreshold: 60 })).toBe(true);
    expect(isHotLead({ grade: 'C', probability: 10, stage: 'NEGOTIATION', hotThreshold: 60 })).toBe(false);
    expect(isHotLead({ grade: 'A', probability: 99, stage: 'LOST', hotThreshold: 60 })).toBe(false);
  });
  it('detects open leads with no next action', () => {
    expect(needsNextAction({ stage: 'CONTACTED', nextFollowUpAt: null })).toBe(true);
    expect(needsNextAction({ stage: 'CONTACTED', nextFollowUpAt: now })).toBe(false);
    expect(needsNextAction({ stage: 'ON_HOLD', nextFollowUpAt: null })).toBe(false);
  });
});
