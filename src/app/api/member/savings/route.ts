// Member portal — savings overview + own accounts + statements — guide §19 (member scope).
import { withAuth, ok, err } from '@/lib/api';
import { db } from '@/lib/db';

function requireMemberId(session: { user: { memberId?: string | null; role: string } }): string | null {
  return session.user.memberId ?? null;
}

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const want = url.searchParams.get('want') ?? 'overview';
  const memberId = requireMemberId(session as never);
  if (session.user.role === 'MEMBER' && !memberId) return err('No member profile linked', 403);
  // staff may pass memberId param
  const scope = session.user.role === 'MEMBER' ? memberId! : url.searchParams.get('memberId') ?? memberId;
  if (!scope) return err('memberId required', 422);

  if (want === 'accounts') {
    const accounts = await db.savingsAccount.findMany({
      where: { memberProfileId: scope },
      include: { product: true, _count: { select: { transactions: true } } },
      orderBy: { openedAt: 'asc' },
    });
    return ok(accounts.map((a) => ({
      id: a.id, accountNumber: a.accountNumber, product: a.product.name, productCode: a.product.code,
      name: a.name ?? '', balanceCents: a.balanceCents, heldFundsCents: a.heldFundsCents,
      interestEarnedCents: a.interestEarnedCents, status: a.status,
      targetCents: a.targetCents, maturityDate: a.maturityDate,
      openedAt: a.openedAt, txCount: a._count.transactions,
      recent: [],
    })));
  }

  if (want === 'transactions') {
    const accountId = url.searchParams.get('accountId');
    const rows = await db.savingsTransaction.findMany({
      where: { memberProfileId: scope, ...(accountId ? { accountId } : {}) },
      orderBy: { valueDate: 'desc' },
      take: 200,
      include: { account: { select: { accountNumber: true } } },
    });
    return ok(rows.map((t) => ({
      id: t.id, reference: t.reference, accountNumber: t.account.accountNumber,
      type: t.type, channel: t.channel, amountCents: t.amountCents,
      balanceAfterCents: t.balanceAfterCents, valueDate: t.valueDate,
      narration: t.narration ?? '', externalRef: t.externalRef ?? '', status: t.status,
    })));
  }

  // overview
  const [accounts, shares, loans, guarantorships, notifications] = await Promise.all([
    db.savingsAccount.findMany({ where: { memberProfileId: scope }, include: { product: true } }),
    db.memberSharePosition.findUnique({ where: { memberProfileId: scope } }),
    db.loan.findMany({ where: { memberProfileId: scope }, include: { product: true, schedule: { orderBy: { installmentNo: 'asc' } } }, orderBy: { disbursedAt: 'desc' } }),
    db.guarantor.findMany({ where: { guarantorMemberId: scope, status: { in: ['PENDING', 'ACCEPTED'] } }, include: { application: { include: { memberProfile: { select: { firstName: true, lastName: true, memberNumber: true } }, product: { select: { name: true } } } } } }),
    db.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);
  const totalSavings = accounts.reduce((s, a) => s + a.balanceCents, 0);
  const activeLoan = loans.find((l) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status)) ?? null;
  const nextInstallment = activeLoan?.schedule.find((s) => s.paidCents < s.totalDueCents && s.status !== 'WAIVED') ?? null;
  return ok({
    accounts: accounts.length, totalSavingsCents: totalSavings,
    heldFundsCents: accounts.reduce((s, a) => s + a.heldFundsCents, 0),
    shares: shares?.totalShares ?? 0, shareValueCents: shares?.totalValueCents ?? 0,
    openLoans: loans.filter((l) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status)).length,
    loanOutstandingCents: activeLoan?.outstandingCents ?? 0,
    nextInstallmentCents: nextInstallment?.totalDueCents ?? null,
    nextDueDate: nextInstallment?.dueDate ?? null,
    guarantorRequests: guarantorships.filter((g) => g.status === 'PENDING').length,
    unreadNotifications: notifications,
    accountList: accounts.map((a) => ({ id: a.id, accountNumber: a.accountNumber, product: a.product.name, balanceCents: a.balanceCents, status: a.status })),
  });
});
