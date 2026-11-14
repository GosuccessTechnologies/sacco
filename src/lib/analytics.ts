// ============================================================================
// Analytics aggregates — DEVELOPER_GUIDE.md §15.2.2 (read-only, GL-cached based).
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export async function overviewStats() {
  const [members, savings, loans, shares, subscribers, payments] = await Promise.all([
    db.memberProfile.count({ where: { status: 'ACTIVE' } }),
    db.savingsAccount.aggregate({ _sum: { balanceCents: true } }),
    db.loan.aggregate({ where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } }, _sum: { outstandingCents: true } }),
    db.memberSharePosition.aggregate({ _sum: { totalShares: true, totalValueCents: true } }),
    db.subscriber.count({ where: { status: 'ACTIVE' } }),
    db.paymentTransaction.count({ where: { status: 'SUCCESS' } }),
  ]);
  const shareCapital = shares._sum.totalValueCents ?? 0;
  return {
    activeMembers: members,
    totalSavingsCents: savings._sum.balanceCents ?? 0,
    loanBookCents: loans._sum.outstandingCents ?? 0,
    totalShares: shares._sum.totalShares ?? 0,
    shareCapitalCents: shareCapital,
    subscribers,
    successfulPayments: payments,
  };
}

/** Public website stats — guide §18.2. */
export async function publicStats() {
  const features = await getSettings('features');
  if (!features.showStatsOnWebsite) return null;
  const [members, savings, disbursed, entity] = await Promise.all([
    db.memberProfile.count({ where: { status: 'ACTIVE' } }),
    db.savingsAccount.aggregate({ _sum: { balanceCents: true } }),
    db.loan.aggregate({ _sum: { principalCents: true } }),
    getSettings('entity'),
  ]);
  const founding = new Date(entity.fiscalYearStart && 2015 ? 2015 : 2015).getFullYear();
  const years = Math.max(1, new Date().getFullYear() - founding);
  return {
    members, totalSavingsCents: savings._sum.balanceCents ?? 0,
    disbursedCents: disbursed._sum.principalCents ?? 0, yearsServing: years,
  };
}

export async function membershipSeries(months = 12) {
  const rows: { month: string; joined: number; exited: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [joined, exited] = await Promise.all([
      db.memberProfile.count({ where: { joinedAt: { gte: start, lt: end } } }),
      db.memberProfile.count({ where: { exitAt: { gte: start, lt: end } } }),
    ]);
    rows.push({ month: start.toLocaleString('en', { month: 'short' }), joined, exited });
  }
  return rows;
}

export async function savingsVsLoansSeries(months = 12) {
  const rows: { month: string; deposits: number; withdrawals: number; disbursed: number; collected: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [dep, wd, disb, coll] = await Promise.all([
      db.savingsTransaction.aggregate({ where: { type: 'DEPOSIT', createdAt: { gte: start, lt: end } }, _sum: { amountCents: true } }),
      db.savingsTransaction.aggregate({ where: { type: 'WITHDRAWAL', createdAt: { gte: start, lt: end } }, _sum: { amountCents: true } }),
      db.loan.aggregate({ where: { disbursedAt: { gte: start, lt: end } }, _sum: { principalCents: true } }),
      db.loanRepayment.aggregate({ where: { createdAt: { gte: start, lt: end } }, _sum: { amountCents: true } }),
    ]);
    rows.push({
      month: start.toLocaleString('en', { month: 'short' }),
      deposits: dep._sum.amountCents ?? 0, withdrawals: wd._sum.amountCents ?? 0,
      disbursed: disb._sum.principalCents ?? 0, collected: coll._sum.amountCents ?? 0,
    });
  }
  return rows;
}

export async function loanBookBreakdown() {
  const byStatus = await db.loan.groupBy({ by: ['status'], _sum: { outstandingCents: true }, _count: true });
  const byProduct = await db.loan.groupBy({ by: ['productId'], _sum: { outstandingCents: true } });
  const products = await db.loanProduct.findMany();
  return {
    byStatus: byStatus.map((s) => ({ status: s.status, outstanding: s._sum.outstandingCents ?? 0, count: s._count })),
    byProduct: byProduct.map((p) => ({
      name: p.name,
      outstanding: byProduct.find((b) => b.productId === p.id)?._sum.outstandingCents ?? 0,
    })),
  };
}

export async function arrearsAging() {
  const loans = await db.loan.findMany({
    where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } },
    include: { schedule: true },
  });
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 } as Record<string, number>;
  const today = new Date();
  let parCents = 0;
  for (const loan of loans) {
    for (const s of loan.schedule) {
      if (s.status === 'WAIVED' || s.paidCents >= s.totalDueCents || s.dueDate >= today) continue;
      const days = Math.floor((today.getTime() - s.dueDate.getTime()) / 86400000);
      const owed = s.totalDueCents - s.paidCents;
      if (days <= 30) buckets['0-30'] += owed;
      else if (days <= 60) buckets['31-60'] += owed;
      else if (days <= 90) buckets['61-90'] += owed;
      else if (days <= 180) buckets['91-180'] += owed;
      else buckets['180+'] += owed;
      if (days > 30) parCents += owed;
    }
  }
  const totalBook = loans.reduce((s, l) => s + l.outstandingCents, 0);
  return { buckets, parCents, parRatio: totalBook ? parCents / totalBook : 0 };
}

export async function channelCashflow() {
  const groups = await db.savingsTransaction.groupBy({ by: ['channel'], _sum: { amountCents: true }, _count: true });
  return groups.map((g) => ({ channel: g.channel, amount: g._sum.amountCents ?? 0, count: g._count }));
}

export async function productMix() {
  const accounts = await db.savingsAccount.groupBy({ by: ['productId'], _sum: { balanceCents: true }, _count: true });
  const products = await db.savingsProduct.findMany();
  return accounts.map((a) => ({
    name: products.find((p) => p.id === a.productId)?.name ?? a.productId,
    balance: a._sum.balanceCents ?? 0, accounts: a._count,
  }));
}
