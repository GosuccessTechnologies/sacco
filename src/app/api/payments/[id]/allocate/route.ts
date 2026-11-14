// Allocate an unallocated (suspense) payment — guide §14.2.2.
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { postSavingsTransaction } from '@/lib/savings/service';
import { postLoanRepayment } from '@/lib/loans/service';

const schema = z.object({
  action: z.literal('allocate'),
  target: z.enum(['SAVINGS_DEPOSIT', 'LOAN_REPAYMENT']),
  accountId: z.string().optional(),
  loanId: z.string().optional(),
});

export const POST = withPermission('payments_allocate', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const pt = await db.paymentTransaction.findUnique({ where: { id } });
  if (!pt) return err('Payment not found', 404);
  if (pt.purpose !== 'UNALLOCATED') return err('Payment is not in suspense', 400);

  try {
    if (d.target === 'SAVINGS_DEPOSIT' && d.accountId) {
      const posted = await postSavingsTransaction({
        accountId: d.accountId, type: 'DEPOSIT', channel: 'MPESA',
        amountCents: pt.amountCents, externalRef: pt.mpesaReceipt ?? pt.requestRef,
        narration: 'Allocated from suspense', performedById: session.user.id,
      });
      await db.paymentTransaction.update({
        where: { id },
        data: { purpose: 'SAVINGS_DEPOSIT', accountId: d.accountId, status: 'SUCCESS', narration: `${pt.narration} [allocated]` },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'PAYMENT_ALLOCATE', module: 'payments', entity: 'PaymentTransaction', entityId: id, after: d, severity: 'warn' });
      return ok(posted);
    }
    if (d.target === 'LOAN_REPAYMENT' && d.loanId) {
      const posted = await postLoanRepayment({
        loanId: d.loanId, amountCents: pt.amountCents, channel: 'MPESA',
        externalRef: pt.mpesaReceipt ?? pt.requestRef, paymentTransactionId: pt.id,
        narration: 'Allocated from suspense', receivedById: session.user.id,
      });
      await db.paymentTransaction.update({
        where: { id },
        data: { purpose: 'LOAN_REPAYMENT', loanId: d.loanId, status: 'SUCCESS', narration: `${pt.narration} [allocated]` },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'PAYMENT_ALLOCATE', module: 'payments', entity: 'PaymentTransaction', entityId: id, after: d, severity: 'warn' });
      return ok(posted);
    }
    return err('Target id required', 422);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
