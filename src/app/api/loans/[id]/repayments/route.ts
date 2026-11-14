// Post a loan repayment — waterfall allocation (guide §10.2.8).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { postLoanRepayment } from '@/lib/loans/service';
import { audit } from '@/lib/audit';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';

const schema = z.object({
  loanId: z.string(),
  amountCents: z.coerce.number().int().positive(),
  channel: z.enum(['COUNTER', 'MPESA', 'PAYROLL', 'PORTAL', 'PESAPAL']),
  externalRef: z.string().optional(),
  narration: z.string().optional(),
});

export const GET = withAuth('loans_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.loanRepayment.findMany({
    where: q.loanId ? { loanId: q.loanId } : {},
    include: { loan: { include: { memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return ok(rows.map((r) => ({
    id: r.id, reference: r.reference, loanNumber: r.loan.loanNumber,
    member: `${r.loan.memberProfile.firstName} ${r.loan.memberProfile.lastName} (${r.loan.memberProfile.memberNumber})`,
    amountCents: r.amountCents, channel: r.channel, externalRef: r.externalRef ?? '—',
    valueDate: r.valueDate, status: r.status, allocation: r.allocation,
  })));
});

export const POST = withPermission('loans_repay_post', async ({ req, session }) => {
  const d = await body(req, schema);
  try {
    const result = await postLoanRepayment({ ...d, receivedById: session.user.id });
    const loan = await db.loan.findUnique({ where: { id: d.loanId }, include: { memberProfile: true } });
    if (loan) {
      await notifyPerson(
        { name: loan.memberProfile.firstName, email: loan.memberProfile.email, phone: loan.memberProfile.phone },
        'repayment_receipt',
        { name: loan.memberProfile.firstName, amount: fmtMoney(d.amountCents), loanNumber: loan.loanNumber, outstanding: fmtMoney(result.newOutstanding) },
      ).catch(() => null);
    }
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_REPAYMENT_POST', module: 'loans', entity: 'LoanRepayment', entityId: result.repaymentId, after: { ...d, allocation: result.allocation }, severity: 'info' });
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
