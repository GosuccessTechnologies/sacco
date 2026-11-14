// Arrears view — guide §10.2.9 (aging buckets feed BI + collections).
import { withAuth, ok } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('loans_view', async () => {
  const today = new Date();
  const loans = await db.loan.findMany({
    where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] }, outstandingCents: { gt: 0 } },
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, phone: true } },
      schedule: { orderBy: { installmentNo: 'asc' } },
    },
  });
  const rows = [];
  for (const loan of loans) {
    const overdue = loan.schedule.filter((s) => s.dueDate < today && s.paidCents < s.totalDueCents && s.status !== 'WAIVED');
    if (!overdue.length) continue;
    const oldest = overdue[0];
    const days = Math.floor((today.getTime() - oldest.dueDate.getTime()) / 86400000);
    const owed = overdue.reduce((s, o) => s + (o.totalDueCents - o.paidCents), 0);
    const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : days <= 180 ? '91-180' : '180+';
    rows.push({
      id: loan.id, loanNumber: loan.loanNumber, bucket,
      member: `${loan.memberProfile.firstName} ${loan.memberProfile.lastName} (${loan.memberProfile.memberNumber})`,
      phone: loan.memberProfile.phone, daysInArrears: days,
      overdueCents: owed, penaltyAccruedCents: loan.penaltyAccruedCents,
      outstandingCents: loan.outstandingCents, status: loan.status,
      nextDueAt: loan.nextDueAt, missedInstallments: overdue.length,
    });
  }
  rows.sort((a, b) => b.daysInArrears - a.daysInArrears);
  return ok(rows);
});
