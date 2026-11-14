// Loan special actions — reschedule / waiver / write-off (guide §10.2.10).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';
import { buildSchedule } from '@/lib/loans/service';

const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RESCHEDULE'), newTermMonths: z.coerce.number().int().min(1), firstDueDate: z.coerce.date().optional(), reason: z.string().min(3) }),
  z.object({ type: z.literal('WAIVER'), penaltyOnly: z.boolean().default(true), reason: z.string().min(3) }),
  z.object({ type: z.literal('WRITE_OFF'), reason: z.string().min(3) }),
]);

export const POST = withPermission('loans_actions', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const limits = await getSettings('limits');
  const loan = await db.loan.findUnique({ where: { id }, include: { memberProfile: true, schedule: { orderBy: { installmentNo: 'asc' } }, application: true } });
  if (!loan) return err('Loan not found', 404);
  const gl = await getSettings('glMap');

  if (d.type === 'WRITE_OFF') {
    if (loan.outstandingCents === 0) return err('Loan already settled', 400);
    if (session.user.role !== 'SUPER_ADMIN' && loan.outstandingCents > limits.writeOffApprovalCents && !session.user.permissions.includes('loans_approve_b3')) {
      return err(`Write-offs above ${limits.writeOffApprovalCents / 100} KES need band-3 authority`, 403);
    }
    const before = { outstandingCents: loan.outstandingCents, status: loan.status };
    await db.$transaction(async (tx) => {
      await postJournal(tx, {
        memo: `Write-off ${loan.loanNumber}: ${d.reason}`,
        source: 'WRITEOFF', sourceRef: loan.loanNumber, postedById: session.user.id,
        lines: [
          { accountCode: gl.writeOffExpense, debit: loan.outstandingCents, narration: 'Write-off' },
          { accountCode: gl.loansPortfolio, credit: loan.outstandingCents },
        ],
      });
      await tx.loan.update({ where: { id }, data: { status: 'WRITTEN_OFF', outstandingCents: 0, writeOffReason: d.reason, closedAt: new Date(), nextDueAt: null } });
      // release guarantor holds
      if (loan.application) {
        const guarantors = await tx.guarantor.findMany({ where: { applicationId: loan.application.id, status: { in: ['ACCEPTED', 'MANUAL_RECORDED'] } } });
        for (const g of guarantors) {
          const main = await tx.savingsAccount.findFirst({ where: { memberProfileId: g.guarantorMemberId }, orderBy: { openedAt: 'asc' } });
          if (main && main.heldFundsCents > 0) {
            await tx.savingsAccount.update({ where: { id: main.id }, data: { heldFundsCents: { decrement: Math.min(main.heldFundsCents, g.guaranteedAmountCents) } } });
          }
        }
      }
      await tx.loanAction.create({ data: { loanId: id, type: 'WRITE_OFF', before: before as any, after: { outstandingCents: 0 }, reason: d.reason, performedById: session.user.id } });
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_WRITE_OFF', module: 'loans', entity: 'Loan', entityId: id, before, after: { reason: d.reason }, severity: 'critical' });
    return ok({ status: 'WRITTEN_OFF' });
  }

  if (d.type === 'RESCHEDULE') {
    if (!['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(loan.status)) return err('Only running loans can be rescheduled', 400);
    const product = await db.loanProduct.findUnique({ where: { id: loan.productId } });
    const schedule = buildSchedule(loan.outstandingCents, loan.interestRateBps, d.newTermMonths, loan.interestMethod as 'REDUCING' | 'FLAT', d.firstDueDate ?? new Date(), product?.gracePeriodDays ?? 0);
    const before = { termMonths: loan.termMonths, installments: loan.schedule.length };
    await db.$transaction(async (tx) => {
      await tx.repaymentSchedule.deleteMany({ where: { loanId: id } });
      await tx.repaymentSchedule.createMany({
        data: schedule.map((s) => ({
          loanId: id, installmentNo: s.installmentNo, dueDate: s.dueDate,
          principalDueCents: s.principalDueCents, interestDueCents: s.interestDueCents, totalDueCents: s.totalDueCents,
        })),
      });
      await tx.loan.update({ where: { id }, data: { termMonths: d.newTermMonths, nextDueAt: schedule[0].dueDate, status: 'ACTIVE' } });
      await tx.loanAction.create({ data: { loanId: id, type: 'RESCHEDULE', before: before as any, after: { termMonths: d.newTermMonths }, reason: d.reason, performedById: session.user.id } });
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_RESCHEDULE', module: 'loans', entity: 'Loan', entityId: id, before, after: { newTermMonths: d.newTermMonths }, severity: 'warn' });
    return ok({ status: 'RESCHEDULED', installments: schedule.length });
  }

  if (d.type === 'WAIVER') {
    const waivePenalty = loan.schedule.reduce((s, r) => s + r.penaltyDueCents, 0);
    if (waivePenalty === 0 && !d.penaltyOnly) return err('No amounts to waive', 400);
    const before = { penaltyAccruedCents: loan.penaltyAccruedCents, totalPenaltyDue: waivePenalty };
    await db.$transaction(async (tx) => {
      if (waivePenalty > 0) {
        await postJournal(tx, {
          memo: `Penalty waiver ${loan.loanNumber}: ${d.reason}`,
          source: 'LOANS', sourceRef: loan.loanNumber, postedById: session.user.id,
          lines: [
            { accountCode: gl.penaltyIncome, debit: waivePenalty, narration: 'Penalty waived (contra income)' },
            { accountCode: gl.loansPortfolio, credit: waivePenalty },
          ],
        });
      }
      // subtract each row's penalty from its totalDue BEFORE zeroing (SQLite-safe loop)
      const rows = await tx.repaymentSchedule.findMany({ where: { loanId: id } });
      for (const r of rows) {
        if (r.penaltyDueCents > 0) {
          await tx.repaymentSchedule.update({ where: { id: r.id }, data: { totalDueCents: r.totalDueCents - r.penaltyDueCents, penaltyDueCents: 0 } });
        }
      }
      await tx.loan.update({ where: { id }, data: { penaltyAccruedCents: 0, penaltyComputedThrough: new Date() } });
      await tx.loanAction.create({ data: { loanId: id, type: 'WAIVER', before: before as any, after: { penaltyWaived: waivePenalty }, reason: d.reason, performedById: session.user.id } });
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_WAIVER', module: 'loans', entity: 'Loan', entityId: id, before, after: { penaltyWaived: waivePenalty }, severity: 'warn' });
    return ok({ penaltyWaivedCents: waivePenalty });
  }

  return err('Unknown action');
});
