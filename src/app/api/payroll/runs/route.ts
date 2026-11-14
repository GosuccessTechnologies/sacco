// Payroll runs — list + generate (statutory config) — guide §17.2.5.
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';

export const GET = withAuth(null, async () => {
  const runs = await db.payrollRun.findMany({
    include: { entries: { include: { staffProfile: { include: { user: { select: { name: true } } } } } } },
    orderBy: { period: 'desc' },
  });
  return ok(runs.map((r) => ({
    id: r.id, period: r.period, status: r.status,
    totalGrossCents: r.totalGrossCents, totalDeductionsCents: r.totalDeductionsCents, totalNetCents: r.totalNetCents,
    payDate: r.payDate, entries: r.entries.map((e) => ({
      id: e.id, staff: e.staffProfile.user.name, basicCents: e.basicCents,
      grossCents: e.grossCents, netCents: e.netCents, deductions: e.deductions,
      allowances: e.allowances, paidVia: e.paidVia ?? '',
    })),
  })));
});

export const POST = withPermission('payroll_run', async ({ req, session }) => {
  const d = await body(req, z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }));
  const dup = await db.payrollRun.findUnique({ where: { period: d.period } });
  if (dup) return err('A run for that period already exists', 409);
  const run = await db.payrollRun.create({ data: { period: d.period, status: 'DRAFT', processedById: session.user.id } });
  return ok({ id: run.id, period: run.period });
});
