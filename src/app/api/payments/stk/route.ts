// Member portal STK push — guide §14.2.2 (members trigger own deposits/repayments).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { stkPush } from '@/lib/payments/integrations';

const schema = z.object({
  phone: z.string().regex(/^\+?\d{10,13}$/),
  amountCents: z.coerce.number().int().positive(),
  purpose: z.enum(['SAVINGS_DEPOSIT', 'LOAN_REPAYMENT', 'SHARE_PURCHASE']),
  accountId: z.string().optional(),
  loanId: z.string().optional(),
});

export const POST = withPermission('payments_stk', async ({ req, session }) => {
  const d = await body(req, schema);
  // members can only push for their own records
  if (session.user.role === 'MEMBER') {
    if (d.accountId) {
      const account = await db.savingsAccount.findUnique({ where: { id: d.accountId } });
      if (!account || account.memberProfileId !== session.user.memberId) return err('Not your account', 403);
    }
    if (d.loanId) {
      const loan = await db.loan.findUnique({ where: { id: d.loanId } });
      if (!loan || loan.memberProfileId !== session.user.memberId) return err('Not your loan', 403);
    }
  }
  const reference = d.accountId
    ? (await db.savingsAccount.findUnique({ where: { id: d.accountId } }))?.accountNumber ?? 'ACCOUNT'
    : d.loanId ? (await db.loan.findUnique({ where: { id: d.loanId } }))?.loanNumber ?? 'LOAN' : 'DIV';
  try {
    const result = await stkPush({
      phone: d.phone, amountCents: d.amountCents,
      accountReference: reference, purpose: d.purpose,
      memberId: session.user.role === 'MEMBER' ? session.user.memberId : null,
      accountId: d.accountId ?? null, loanId: d.loanId ?? null,
      description: `${d.purpose.replace(/_/g, ' ').toLowerCase()}`,
    });
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
