// Banks + vendors + statements listing + trial balance / financials (guide §13.4).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const [banks, vendors, trial] = await Promise.all([
    db.bankAccount.findMany({
      include: {
        glAccount: { select: { code: true, name: true } },
        statementLines: { take: 5, orderBy: { statementDate: 'desc' } },
        _count: { select: { statementLines: true, reconciliations: true } },
      },
    }),
    db.vendor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.glAccount.findMany({ where: { isPostable: true }, orderBy: { code: 'asc' } }),
  ]);
  const totals = { ASSET: 0, LIABILITY: 0, EQUITY: 0, INCOME: 0, EXPENSE: 0 } as Record<string, number>;
  for (const a of trial) totals[a.type] += a.cachedBalanceCents;
  return ok({
    banks: banks.map((b) => ({
      id: b.id, name: b.name, bankName: b.bankName, accountNumber: b.accountNumber,
      gl: `${b.glAccount.code} ${b.glAccount.name}`,
      openingBalanceCents: b.openingBalanceCents, active: b.active,
      lines: b._count.statementLines, reconciliations: b._count.reconciliations,
    })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.name, category: v.category ?? '', phone: v.phone ?? '' })),
    trialBalance: trial.map((a) => ({ code: a.code, name: a.name, type: a.type, balanceCents: a.cachedBalanceCents })),
    totals,
    check: totals.ASSET - totals.LIABILITY - totals.EQUITY - totals.INCOME + totals.EXPENSE, // must be 0
  });
});
