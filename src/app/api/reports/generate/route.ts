// Regulatory report generation — SASRA quarterly (guide §15.2.1).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  definitionCode: z.literal('SASRA_Q').default('SASRA_Q'),
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
});

export const GET = withAuth('reports_view', async () => {
  const rows = await db.reportRun.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return ok(rows.map((r) => ({
    id: r.id, definitionCode: r.definitionCode, periodLabel: r.periodLabel,
    periodFrom: r.periodFrom, periodTo: r.periodTo, figures: r.figures, status: r.status,
    generatedAt: r.createdAt,
  })));
});

export const POST = withPermission('reports_generate', async ({ req, session }) => {
  const d = await body(req, schema);
  // live figures from GL cached balances + operational aggregates
  const accounts = await db.glAccount.findMany({ where: { isPostable: true } });
  const sumBy = (type: string, prefix: string[]) =>
    accounts.filter((a) => a.type === type && prefix.some((p) => a.code.startsWith(p)))
      .reduce((s, a) => s + a.cachedBalanceCents, 0);
  const [members, savings, loansOutstanding, disbursed] = await Promise.all([
    db.memberProfile.count({ where: { status: 'ACTIVE' } }),
    db.savingsAccount.aggregate({ _sum: { balanceCents: true } }),
    db.loan.aggregate({ where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } }, _sum: { outstandingCents: true } }),
    db.loan.aggregate({ _sum: { principalCents: true } }),
  ]);
  const figures = {
    totalAssetsCents: sumBy('ASSET', ['1']),
    totalLiabilitiesCents: sumBy('LIABILITY', ['2']),
    shareCapitalCents: sumBy('EQUITY', ['31']),
    retainedEarningsCents: sumBy('EQUITY', ['32']),
    incomeCents: sumBy('INCOME', ['4']),
    expensesCents: sumBy('EXPENSE', ['5']),
    depositsCents: savings._sum.balanceCents ?? 0,
    loanPortfolioCents: loansOutstanding._sum.outstandingCents ?? 0,
    loansDisbursedCents: disbursed._sum.principalCents ?? 0,
    activeMembers: members,
    liquidityCents: sumBy('ASSET', ['10']),
  };
  const periodLabel = `${d.periodFrom.toISOString().slice(0, 10)} → ${d.periodTo.toISOString().slice(0, 10)}`;
  const run = await db.reportRun.create({
    data: { definitionCode: 'SASRA_Q', periodLabel, periodFrom: d.periodFrom, periodTo: d.periodTo, figures: figures as any, generatedById: session.user.id, status: 'GENERATED' },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'REPORT_GENERATE', module: 'reports', entity: 'ReportRun', entityId: run.id, after: { periodLabel }, severity: 'info' });
  return ok({ id: run.id, periodLabel, figures });
});
