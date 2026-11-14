// Expense approve / pay / cancel — payment posts GL (guide §13.2.4).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';

const schema = z.object({
  action: z.enum(['approve', 'pay', 'cancel']),
  reason: z.string().optional(),
  paidVia: z.enum(['BANK', 'CASH', 'MPESA']).optional(),
  paymentRef: z.string().optional(),
});

export const POST = withPermission(null, async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  // Expense has no glAccount relation — fetch the GL row via glAccountId
  const expense = await db.expense.findUnique({ where: { id } });
  if (!expense) return err('Expense not found', 404);
  const glAccount = await db.glAccount.findUnique({ where: { id: expense.glAccountId } });
  if (!glAccount) return err('Expense GL account missing', 422);

  if (d.action === 'approve') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('accounting_expenses_approve')) {
      return err('Approval permission required', 403);
    }
    if (expense.status !== 'DRAFT') return err('Only drafts can be approved', 400);
    await db.expense.update({ where: { id }, data: { status: 'APPROVED', approvedById: session.user.id } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'EXPENSE_APPROVE', module: 'accounting', entity: 'Expense', entityId: id, severity: 'info' });
    return ok({ status: 'APPROVED' });
  }

  if (d.action === 'pay') {
    if (expense.status !== 'APPROVED') return err('Expense must be approved before paying', 400);
    if (!d.paidVia) return err('Payment channel required', 422);
    const gl = await getSettings('glMap');
    const settle = d.paidVia === 'BANK' ? gl.bankOperations : d.paidVia === 'MPESA' ? gl.mpesaSettlement : gl.cashTeller;
    await db.$transaction(async (tx) => {
      const journalId = await postJournal(tx, {
        memo: `Expense payment: ${expense.description}`,
        source: 'EXPENSE', postedById: session.user.id,
        lines: [
          { accountCode: glAccount.code, debit: expense.amountCents, narration: expense.description },
          { accountCode: settle, credit: expense.amountCents, narration: `Paid via ${d.paidVia}` },
        ],
      });
      await tx.expense.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), paidVia: d.paidVia, paymentRef: d.paymentRef ?? null, journalEntryId: journalId },
      });
    });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'EXPENSE_PAY', module: 'accounting', entity: 'Expense', entityId: id, after: { paidVia: d.paidVia }, severity: 'warn' });
    return ok({ status: 'PAID' });
  }

  if (d.action === 'cancel') {
    if (expense.status === 'PAID') return err('Paid expenses cannot be cancelled', 400);
    await db.expense.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'EXPENSE_CANCEL', module: 'accounting', entity: 'Expense', entityId: id, after: { reason: d.reason }, severity: 'warn' });
    return ok({ status: 'CANCELLED' });
  }
  return err('Unknown action', 400);
});
