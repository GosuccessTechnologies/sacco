// Savings transactions ledger — list + post (guide §9.4). Teller limits enforced.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { postSavingsTransaction } from '@/lib/savings/service';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { notifyPerson } from '@/lib/notify';
import { fmtMoney } from '@/lib/money';

const postSchema = z.object({
  accountId: z.string(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'FEE', 'ADJUSTMENT']),
  channel: z.enum(['COUNTER', 'MPESA', 'BANK', 'STANDING_ORDER', 'INTERNAL', 'PORTAL']),
  amountCents: z.coerce.number().int().positive(),
  narration: z.string().optional(),
  valueDate: z.coerce.date().optional(),
  externalRef: z.string().optional(),
});

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.savingsTransaction.findMany({
    where: {
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.memberId ? { memberProfileId: q.memberId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.from || q.to ? { valueDate: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
      ...(q.search ? { OR: [{ reference: { contains: q.search } }, { narration: { contains: q.search } }, { account: { accountNumber: { contains: q.search } } }] } : {}),
    },
    include: {
      account: { select: { accountNumber: true } },
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } },
    },
    orderBy: { valueDate: 'desc' },
    take: 800,
  });
  return ok(rows.map((t) => ({
    id: t.id, reference: t.reference, accountNumber: t.account.accountNumber,
    member: `${t.memberProfile.firstName} ${t.memberProfile.lastName} (${t.memberProfile.memberNumber})`,
    type: t.type, channel: t.channel, amountCents: t.amountCents, balanceAfterCents: t.balanceAfterCents,
    valueDate: t.valueDate, narration: t.narration ?? '', externalRef: t.externalRef ?? '—', status: t.status,
  })));
});

export const POST = withPermission('savings_post', async ({ req, session }) => {
  const d = await body(req, postSchema);
  const limits = await getSettings('limits');
  const account = await db.savingsAccount.findUnique({ where: { id: d.accountId }, include: { memberProfile: true, product: true } });
  if (!account) return err('Account not found', 404);
  if (d.channel === 'COUNTER' && session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('fosa_override')) {
    if (d.amountCents > limits.tellerMaxCents) return err(`Above the per-transaction limit (${fmtMoney(limits.tellerMaxCents)}). Ask a manager to post this.`, 403);
  }
  try {
    const result = await postSavingsTransaction({ ...d, performedById: session.user.id });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'SAVINGS_POST', module: 'savings', entity: 'SavingsTransaction', entityId: result.transactionId, after: { ...d, reference: result.reference }, severity: 'info' });
    // alert member
    const alertCode = d.type === 'WITHDRAWAL' ? 'savings_withdrawal_alert' : 'savings_deposit_alert';
    await notifyPerson(
      { name: account.memberProfile.firstName, email: account.memberProfile.email, phone: account.memberProfile.phone },
      alertCode,
      { name: account.memberProfile.firstName, accountNumber: account.accountNumber, amount: fmtMoney(d.amountCents), channel: d.channel, balance: fmtMoney(result.balanceAfterCents) },
    ).catch(() => null);
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
