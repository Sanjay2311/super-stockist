// tests/domain/alerts.test.ts
import { describe, it, expect } from 'vitest';
import {
  followUpOverdueAlert, quotationStaleAlert, distributorReviewDueAlert,
  inactiveDistributorAlert, emptyTerritoryAlert, missingDailyReportAlert,
  newDistributorAppointedAlert,
} from '@/domain/alerts';

describe('alert classifiers', () => {
  it('follow-up overdue: critical at 3+ days, attention below', () => {
    const critical = followUpOverdueAlert({ leadId: 'l1', businessName: 'Acme', daysOverdue: 3, assignedEmployeeId: 'e1' });
    expect(critical.severity).toBe('critical');
    expect(critical.entityType).toBe('lead');
    expect(critical.entityId).toBe('l1');
    expect(critical.title).toMatch(/Acme/);
    const attention = followUpOverdueAlert({ leadId: 'l2', businessName: 'Beta', daysOverdue: 1, assignedEmployeeId: null });
    expect(attention.severity).toBe('attention');
  });

  it('quotation stale is always attention', () => {
    const a = quotationStaleAlert({ quotationId: 'q1', quoteNo: 'Q-1', daysSinceSent: 6, employeeId: null });
    expect(a.severity).toBe('attention');
    expect(a.entityType).toBe('quotation');
    expect(a.title).toMatch(/Q-1/);
  });

  it('distributor review due: critical once overdue, attention when due today', () => {
    expect(distributorReviewDueAlert({ distributorId: 'd1', businessName: 'X', daysOverdue: 1 }).severity).toBe('critical');
    expect(distributorReviewDueAlert({ distributorId: 'd1', businessName: 'X', daysOverdue: 0 }).severity).toBe('attention');
  });

  it('inactive distributor, empty territory, missing daily report are attention', () => {
    expect(inactiveDistributorAlert({ distributorId: 'd1', businessName: 'X' }).severity).toBe('attention');
    expect(emptyTerritoryAlert({ territoryId: 't1', name: 'Zone A' }).severity).toBe('attention');
    const md = missingDailyReportAlert({ employeeId: 'e1', employeeName: 'Priya', date: '2026-09-04' });
    expect(md.severity).toBe('attention');
    expect(md.targetUserId).toBeNull();
  });

  it('new distributor appointed is positive', () => {
    expect(newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }).severity).toBe('positive');
  });
});
