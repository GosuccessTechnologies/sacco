// Dividend runs — list + create + approve (guide §11.2.3).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  year: z.coerce.number().int().min(2015).max(2100),
  method: z.enum(['PROPORTIONAL_SHARES', 'SAVINGS_WEIGHTED', 'HYBRID']),
  totalPoolCents: z.coerce.number().int().positive(),
  depositInterestBps: z.coerce.number().int().min(0).default(0),
});

export const GET = withAuth(null, async () => {
  const rows = await db.dividendRun.findMany({
    include: { _count: { select: { entries: true } }, entries: { where: { paidAt: { not: null } }, select: { totalPayoutCents: true } } },
    orderBy: { year: 'desc' },
  });
  return ok(rows.map((r) => ({
    id: r.id, year: r.year, method: r.method, totalPoolCents: r.totalPoolCents,
    depositInterestBps: r.depositInterestBps, status: r.status,
    entries: r._count.entries, paidEntries: r.entries.length,
    paidTotalCents: r.entries.reduce((s, e) => s + e.totalPayoutCents, 0),
    computedAt: r.computedAt, approvedAt: r.approvedAt, paidAt: r.paidAt,
  })));
});

export const POST = withPermission('dividends_run', async ({ req, session }) => {
  const d = await body(req, schema);
  const dup = await db.dividendRun.findUnique({ where: { year: d.year } });
  if (dup) return err('A run for that year already exists', 409);
  const row = await db.dividendRun.create({ data: { ...d, status: 'DRAFT', createdById: session.user.id } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'DIVIDEND_RUN_CREATE', module: 'dividends', entity: 'DividendRun', entityId: row.id, after: d, severity: 'info' });
  return ok(row);
});
