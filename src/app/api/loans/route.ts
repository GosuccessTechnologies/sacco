// Loan portfolio — guide §10.4.
import { withAuth, withPermission, ok, query } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('loans_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.loan.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.memberId ? { memberProfileId: q.memberId } : {}),
      ...(q.search ? { OR: [{ loanNumber: { contains: q.search } }, { memberProfile: { OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { memberNumber: { contains: q.search } }] } }] } : {}),
    },
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, phone: true } },
      product: { select: { name: true, interestRateBps: true, interestMethod: true } },
      application: { select: { applicationNumber: true } },
      _count: { select: { repayments: true, schedule: true } },
    },
    orderBy: { disbursedAt: 'desc' },
    take: 500,
  });
  const today = new Date();
  return ok(rows.map((l) => {
    const overdueDays = l.nextDueAt && l.nextDueAt < today && l.outstandingCents > 0
      ? Math.floor((today.getTime() - l.nextDueAt.getTime()) / 86400000) : 0;
    return {
      id: l.id, loanNumber: l.loanNumber, applicationNumber: l.application?.applicationNumber ?? '',
      member: `${l.memberProfile.firstName} ${l.memberProfile.lastName} (${l.memberProfile.memberNumber})`,
      memberId: l.memberProfileId, memberPhone: l.memberProfile.phone,
      product: l.product.name, rate: l.product.interestRateBps, method: l.product.interestMethod,
      principalCents: l.principalCents, netDisbursedCents: l.netDisbursedCents, feesChargedCents: l.feesChargedCents,
      outstandingCents: l.outstandingCents, penaltyAccruedCents: l.penaltyAccruedCents,
      termMonths: l.termMonths, status: l.status, disbursedAt: l.disbursedAt,
      channel: l.disbursementChannel, nextDueAt: l.nextDueAt, overdueDays,
      installments: l._count.schedule, repayments: l._count.repayments,
    };
  }));
});
