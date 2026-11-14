// Approve + pay payroll — GL postings + payslips (guide §17.2.5).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';

const schema = z.object({ action: z.enum(['approve', 'pay']), payDate: z.coerce.date().optional() });

export const POST = withPermission(null, async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const run = await db.payrollRun.findUnique({ where: { id }, include: { entries: { include: { staffProfile: { include: { user: true } } } } } });
  if (!run) return err('Run not found', 404);

  if (d.action === 'approve') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('payroll_approve')) {
      return err('Payroll approval permission required', 403);
    }
    if (run.status !== 'DRAFT') return err('Only DRAFT runs can be approved', 400);
    await db.payrollRun.update({ where: { id }, data: { status: 'APPROVED', approvedById: session.user.id } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'PAYROLL_APPROVE', module: 'payroll', entity: 'PayrollRun', entityId: id, severity: 'critical' });
    return ok({ status: 'APPROVED' });
  }

  if (d.action === 'pay') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('payroll_pay')) {
      return err('Payroll payment permission required', 403);
    }
    if (run.status !== 'APPROVED') return err('Run must be APPROVED first', 400);
    const gl = await getSettings('glMap');
    const totalStatutory = run.entries.reduce((s, e) => {
      const dd = (e.deductions as any) ?? {};
      return s + (dd.PAYE ?? 0) + (dd.NSSF ?? 0) + (dd.SHIF ?? 0) + (dd.HousingLevy ?? 0);
    }, 0);
    const totalSaccoLoan = run.entries.reduce((s, e) => s + ((e.deductions as any)?.SaccoLoan ?? 0), 0);
    const net = run.totalNetCents;
    await db.$transaction(async (tx) => {
      const journalId = await postJournal(tx, {
        memo: `Payroll ${run.period} — ${run.entries.length} staff`,
        source: 'PAYROLL', postedById: session.user.id,
        lines: [
          { accountCode: gl.salariesExpense, debit: run.totalGrossCents, narration: 'Gross salaries' },
          { accountCode: gl.statutoryLiabilities, credit: totalStatutory, narration: 'PAYE/NSSF/SHIF/Housing Levy payable' },
          ...(totalSaccoLoan > 0 ? [{ accountCode: gl.loansPortfolio, credit: totalSaccoLoan, narration: 'Staff sacco loan deductions' }] : []),
          { accountCode: gl.bankOperations, credit: net, narration: 'Net pay via bank' },
        ],
      });
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'PAID', payDate: d.payDate ?? new Date(), journalEntryId: journalId },
      });
      await tx.payrollEntry.updateMany({ where: { runId: id }, data: { paidVia: 'BANK' } });
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'PAYROLL_PAY', module: 'payroll', entity: 'PayrollRun', entityId: id, after: { net, statutory: totalStatutory }, severity: 'critical' });
    return ok({ status: 'PAID', netCents: net, statutoryCents: totalStatutory });
  }
  return err('Unknown action', 400);
});
