// tests/services/notification.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateTestDb, resetDb, testDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { territories } from '@/server/db/schema/territory';
import { distributorLeads } from '@/server/db/schema/crm';
import { notifications } from '@/server/db/schema/notification';
import {
  runAlertScan, listNotifications, markRead, unreadCount, createNotification,
} from '@/server/services/notification';
import { newDistributorAppointedAlert } from '@/domain/alerts';
import type { AppUser } from '@/server/auth/session';

const owner = (orgId: string): AppUser => ({ id: 'u-owner', email: 'o', name: 'O', role: 'OWNER', employeeId: null, orgId });
const sales = (orgId: string, employeeId: string): AppUser => ({ id: 'u-sales', email: 's', name: 'S', role: 'SALES', employeeId, orgId });

beforeAll(migrateTestDb);
beforeEach(resetDb);

describe('notification service', () => {
  it('runAlertScan raises an empty-territory alert and is idempotent same-day', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(territories).values({ orgId, name: 'Zone Empty', type: 'ZONE', parentId: null });
    const first = await runAlertScan(orgId);
    expect(first.created).toBeGreaterThan(0);
    const rows = await testDb.select().from(notifications).where(eq(notifications.category, 'empty_territory'));
    expect(rows.length).toBe(1);
    const second = await runAlertScan(orgId);
    expect(second.created).toBe(0); // same day -> dedup, nothing new
    const rowsAfter = await testDb.select().from(notifications).where(eq(notifications.category, 'empty_territory'));
    expect(rowsAfter.length).toBe(1);
  });

  it('runAlertScan raises a follow-up-overdue alert for an overdue open lead', async () => {
    const { orgId } = await seedBase();
    await testDb.insert(distributorLeads).values({
      orgId, businessName: 'Overdue Co', contactPerson: 'x', phone: '9800000010',
      stage: 'CONTACTED', nextFollowUpAt: new Date(Date.now() - 4 * 86_400_000),
    });
    await runAlertScan(orgId);
    const rows = await testDb.select().from(notifications).where(eq(notifications.category, 'follow_up_overdue'));
    expect(rows.length).toBe(1);
    expect(rows[0].severity).toBe('critical'); // 4 days overdue
  });

  it('runAlertScan\'s follow-up-overdue alert is targeted at the lead\'s assigned employee (not hardcoded null)', async () => {
    const { orgId } = await seedBase();
    const empId = '33333333-3333-3333-3333-333333333333';
    await testDb.insert(distributorLeads).values({
      orgId, businessName: 'Assigned Overdue Co', contactPerson: 'x', phone: '9800000011',
      stage: 'CONTACTED', nextFollowUpAt: new Date(Date.now() - 2 * 86_400_000), assignedEmployeeId: empId,
    });
    await runAlertScan(orgId);
    const [row] = await testDb.select().from(notifications).where(eq(notifications.category, 'follow_up_overdue'));
    expect(row.targetUserId).toBe(empId);
  });

  it('listNotifications scopes by role: OWNER sees all, SALES sees only null-target + own-target', async () => {
    const { orgId } = await seedBase();
    await createNotification(orgId, newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }), '2026-09-04');
    await createNotification(orgId, {
      category: 'follow_up_overdue', severity: 'attention', title: 'targeted',
      entityType: 'lead', entityId: 'l1', targetUserId: 'emp-1',
    }, '2026-09-04');

    const ownerRows = await listNotifications(owner(orgId));
    expect(ownerRows.length).toBe(2);
    const salesOther = await listNotifications(sales(orgId, 'emp-2'));
    expect(salesOther.length).toBe(1); // only the null-target one
    const salesMine = await listNotifications(sales(orgId, 'emp-1'));
    expect(salesMine.length).toBe(2);
  });

  it('markRead sets readAt and unreadCount drops', async () => {
    const { orgId } = await seedBase();
    await createNotification(orgId, newDistributorAppointedAlert({ distributorId: 'd1', businessName: 'X' }), '2026-09-04');
    const user = owner(orgId);
    expect(await unreadCount(user)).toBe(1);
    const [row] = await listNotifications(user);
    const updated = await markRead(user, row.id);
    expect(updated.readAt).not.toBeNull();
    expect(await unreadCount(user)).toBe(0);
  });

  it('markRead rejects marking a notification outside the caller\'s scope', async () => {
    const { orgId } = await seedBase();
    // targeted at a different employee than the caller
    await createNotification(orgId, {
      category: 'follow_up_overdue', severity: 'attention', title: 'targeted',
      entityType: 'lead', entityId: 'l1', targetUserId: 'emp-1',
    }, '2026-09-04');
    const [row] = await testDb.select().from(notifications);

    const otherSales = sales(orgId, 'emp-2');
    await expect(markRead(otherSales, row.id)).rejects.toThrow();
    const stillUnread = await testDb.select().from(notifications).where(eq(notifications.id, row.id));
    expect(stillUnread[0].readAt).toBeNull(); // not mutated by the rejected caller

    // the owning employee CAN mark it read
    const owningSales = sales(orgId, 'emp-1');
    const updated = await markRead(owningSales, row.id);
    expect(updated.readAt).not.toBeNull();
  });
});
