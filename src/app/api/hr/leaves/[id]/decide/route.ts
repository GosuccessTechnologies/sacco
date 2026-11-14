// Leave decisions — guide §17.2.5.
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const POST = withPermission('hr_leave_approve', async ({ req, params, session }) => {
  const { id } = params;
  const { decision, note } = await body(req, z.object({ decision: z.enum(['approve', 'reject']), note: z.string().optional() }));
  const row = await db.leaveRequest.findUnique({ where: { id } });
  if (!row) return err('Request not found', 404);
  if (row.status !== 'PENDING') return err('Already decided', 409);
  const status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
  await db.leaveRequest.update({ where: { id }, data: { status, decidedById: session.user.id, decidedAt: new Date() } });
  // cover attendance for approved leave dates
  if (decision === 'approve') {
    const dates: Date[] = [];
    for (let d = new Date(row.fromDate); d <= row.toDate; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    for (const date of dates) {
      await db.attendanceRecord.upsert({
        where: { staffProfileId_date: { staffProfileId: row.staffProfileId, date } },
        create: { staffProfileId: row.staffProfileId, date, status: 'LEAVE', notes: `${row.type} leave` },
        update: { status: 'LEAVE' },
      }).catch(() => null);
    }
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'LEAVE_DECIDE', module: 'hr', entity: 'LeaveRequest', entityId: id, after: { status, note }, severity: 'info' });
  return ok({ status });
});
