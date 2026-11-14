// OTC teller transactions — guide §12.2.2. Posts via the savings engine + GL.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postSavingsTransaction } from '@/lib/savings/service';
import { postLoanRepayment } from '@/lib/loans/service';
import { purchaseShares } from '@/lib/shares/service';
import { nextSequence } from '@/lib/core-utils';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.tellerTransaction.findMany({
    where: q.sessionId ? { sessionId: q.sessionId } : {},
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } },
      account: { select: { accountNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  return ok(rows.map((t) => ({
    id: t.id, receiptNo: t.receiptNo, type: t.type,
    member: t.memberProfile ? `${t.memberProfile.firstName} ${t.memberProfile.lastName} (${t.memberProfile.memberNumber})` : '—',
    accountNumber: t.account?.accountNumber ?? '—',
    amountCents: t.amountCents, status: t.status,
    chequeBank: t.chequeBank ?? '', chequeNo: t.chequeNo ?? '',
    narration: t.narration ?? '', createdAt: t.createdAt,
  })));
});

const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CASH_DEPOSIT'), accountId: z.string(), amountCents: z.coerce.number().int().positive(), narration: z.string().optional() }),
  z.object({ type: z.literal('CASH_WITHDRAWAL'), accountId: z.string(), amountCents: z.coerce.number().int().positive(), narration: z.string().optional() }),
  z.object({ type: z.literal('CHEQUE_DEPOSIT'), accountId: z.string(), amountCents: z.coerce.number().int().positive(), chequeBank: z.string().min(2), chequeNo: z.string().min(2) }),
  z.object({ type: z.literal('LOAN_REPAYMENT'), loanId: z.string(), amountCents: z.coerce.number().int().positive(), narration: z.string().optional() }),
  z.object({ type: z.literal('SHARE_PURCHASE'), memberProfileId: z.string(), quantity: z.coerce.number().int().min(1) }),
]);

export const POST = withPermission('fosa_post', async ({ req, session }) => {
  const d = await body(req, schema);
  // enforce single open till
  const till = await db.tellerSession.findFirst({ where: { userId: session.user.id, status: 'OPEN' } });
  if (!till) return err('Open a teller session (till) first', 400);
  const limits = await getSettings('limits');
  if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('fosa_override') && d.amountCents > limits.tellerMaxCents) {
    return err(`Above the teller limit — ask a manager to override`, 403);
  }
  const account = 'accountId' in d ? await db.savingsAccount.findUnique({ where: { id: d.accountId }, include: { memberProfile: true } }) : null;

  try {
    let receiptNo = '';
    if (d.type === 'CASH_DEPOSIT' || d.type === 'CASH_WITHDRAWAL') {
      if (!account) return err('Account not found', 404);
      const posted = await postSavingsTransaction({
        accountId: d.accountId,
        type: d.type === 'CASH_DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL',
        channel: 'COUNTER', amountCents: d.amountCents, narration: d.narration ?? `Counter ${d.type.toLowerCase()}`,
        performedById: session.user.id,
      });
      receiptNo = posted.reference;
      const row = await db.tellerTransaction.create({
        data: {
          receiptNo, sessionId: till.id, type: d.type, memberProfileId: account.memberProfileId,
          accountId: d.accountId, amountCents: d.amountCents, status: 'POSTED',
          narration: d.narration ?? '', performedById: session.user.id, savingsTransactionId: posted.transactionId,
        },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'FOSA_POST', module: 'fosa', entity: 'TellerTransaction', entityId: row.id, after: d, severity: 'info' });
      return ok({ receiptNo, ...posted });
    }

    if (d.type === 'CHEQUE_DEPOSIT') {
      if (!account) return err('Account not found', 404);
      const row = await db.tellerTransaction.create({
        data: {
          receiptNo: `CHQ-${Date.now().toString(36).toUpperCase()}`, sessionId: till.id, type: 'CHEQUE_DEPOSIT',
          memberProfileId: account.memberProfileId, accountId: d.accountId, amountCents: d.amountCents,
          chequeBank: d.chequeBank, chequeNo: d.chequeNo, status: 'PENDING_CLEARING',
          narration: `Cheque ${d.chequeBank} #${d.chequeNo}`, performedById: session.user.id,
        },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'FOSA_CHEQUE_DEPOSIT', module: 'fosa', entity: 'TellerTransaction', entityId: row.id, after: d, severity: 'info' });
      return ok({ receiptNo: row.receiptNo, status: 'PENDING_CLEARING', clearsAfterDays: limits.chequeClearingDays });
    }

    if (d.type === 'LOAN_REPAYMENT') {
      const result = await postLoanRepayment({ loanId: d.loanId, amountCents: d.amountCents, channel: 'COUNTER', narration: d.narration, receivedById: session.user.id });
      const row = await db.tellerTransaction.create({
        data: {
          receiptNo: result.reference, sessionId: till.id, type: 'LOAN_REPAYMENT', loanId: d.loanId,
          amountCents: d.amountCents, status: 'POSTED', narration: d.narration ?? 'Counter loan repayment',
          performedById: session.user.id, loanRepaymentId: result.repaymentId,
        },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'FOSA_LOAN_REPAYMENT', module: 'fosa', entity: 'TellerTransaction', entityId: row.id, after: d, severity: 'info' });
      return ok({ receiptNo: result.reference, ...result });
    }

    if (d.type === 'SHARE_PURCHASE') {
      const result = await purchaseShares({ memberProfileId: d.memberProfileId, quantity: d.quantity, channel: 'COUNTER', performedById: session.user.id });
      const row = await db.tellerTransaction.create({
        data: {
          receiptNo: `SHR-${Date.now().toString(36).toUpperCase()}`, sessionId: till.id, type: 'SHARE_PURCHASE',
          memberProfileId: d.memberProfileId, amountCents: result.amount, status: 'POSTED',
          narration: `Share purchase ${d.quantity}`, performedById: session.user.id, shareTransactionId: result.shareTransactionId,
        },
      });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'FOSA_SHARE_PURCHASE', module: 'fosa', entity: 'TellerTransaction', entityId: row.id, after: d, severity: 'info' });
      return ok({ receiptNo: row.receiptNo, ...result });
    }
    return err('Unknown type', 400);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
