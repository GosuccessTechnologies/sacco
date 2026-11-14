// HR staff + leave + attendance — guide §17.4.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const [staff, leaves, attendance] = await Promise.all([
    db.staffProfile.findMany({
      include: { user: { select: { name: true, email: true, designation: true, status: true, lastLoginAt: true } } },
      orderBy: { staffNo: 'asc' },
    }),
    db.leaveRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { staffProfile: { include: { user: { select: { name: true } } } } } }),
    q.date ? db.attendanceRecord.findMany({ where: { date: new Date(q.date) }, include: { staffProfile: { include: { user: { select: { name: true } } } } } }) : Promise.resolve([]),
  ]);
  return ok({
    staff: staff.map((s) => ({
      id: s.id, staffNo: s.staffNo, name: s.user.name, email: s.user.email,
      designation: s.designation, department: s.department ?? '',
      employmentDate: s.employmentDate, grossSalaryCents: s.grossSalaryCents,
      basicSalaryCents: s.basicSalaryCents, status: s.status,
    })),
    leaves: leaves.map((l) => ({
      id: l.id, staff: l.staffProfile.user.name, type: l.type,
      fromDate: l.fromDate, toDate: l.toDate, days: l.days, reason: l.reason ?? '',
      status: l.status, createdAt: l.createdAt,
    })),
    attendance: attendance.map((a) => ({
      id: a.id, staff: a.staffProfile.user.name, date: a.date,
      checkIn: a.checkIn, checkOut: a.checkOut, status: a.status, notes: a.notes ?? '',
    })),
  });
});

const leaveSchema = z.object({
  staffProfileId: z.string(),
  type: z.enum(['ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE']),
  fromDate: z.coerce.date(), toDate: z.coerce.date(),
  days: z.coerce.number().int().min(1).max(90),
  reason: z.string().optional(),
});

export const POST = withPermission('hr_staff', async ({ req, session }) => {
  const d = await body(req, leaveSchema);
  const row = await db.leaveRequest.create({ data: { ...d, status: 'PENDING' } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'LEAVE_REQUEST_CREATE', module: 'hr', entity: 'LeaveRequest', entityId: row.id, after: d, severity: 'info' });
  return ok(row);
});
