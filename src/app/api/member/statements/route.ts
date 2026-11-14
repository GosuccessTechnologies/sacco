// Statements — mini/full generation for a member account (guide §12.2.3).
import { withAuth, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const q = url.searchParams;
  const accountId = q.get('accountId');
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : q.get('memberId');
  if (!accountId) return err('accountId required', 422);
  const account = await db.savingsAccount.findUnique({ where: { id: accountId }, include: { product: true, memberProfile: true } });
  if (!account) return err('Account not found', 404);
  if (session.user.role === 'MEMBER' && account.memberProfileId !== session.user.memberId) {
    return err('Not your account', 403);
  }
  const type = (q.get('type') ?? 'FULL') as 'MINI' | 'FULL';
  const take = type === 'MINI' ? 10 : 500;
  const rows = await db.savingsTransaction.findMany({
    where: { accountId, status: { not: 'REVERSED' } },
    orderBy: { valueDate: 'desc' },
    take,
  });
  const ordered = rows.reverse();
  const from = q.get('from') ? new Date(q.get('from')!) : null;
  const to = q.get('to') ? new Date(q.get('to')!) : null;
  const filtered = from || to ? ordered.filter((t) => (!from || t.valueDate >= from) && (!to || t.valueDate <= to)) : ordered;
  await db.statementRequest.create({
    data: {
      memberProfileId: account.memberProfileId, accountId,
      type, periodFrom: from ?? new Date(0), periodTo: to ?? new Date(),
      format: 'PDF', requestedById: session.user.id, generatedAt: new Date(),
    },
  }).catch(() => null);
  return ok({
    account: {
      accountNumber: account.accountNumber, product: account.product.name,
      member: `${account.memberProfile.firstName} ${account.memberProfile.lastName} (${account.memberProfile.memberNumber})`,
      balanceCents: account.balanceCents, heldFundsCents: account.heldFundsCents,
      interestEarnedCents: account.interestEarnedCents, status: account.status,
    },
    transactions: filtered.map((t) => ({
      valueDate: t.valueDate, type: t.type, channel: t.channel,
      amountCents: t.amountCents, balanceAfterCents: t.balanceAfterCents,
      narration: t.narration ?? '', reference: t.reference, externalRef: t.externalRef ?? '',
    })),
    opening: filtered[0]?.balanceAfterCents !== undefined ? filtered[0].balanceAfterCents - (filtered[0].type === 'WITHDRAWAL' || filtered[0].type === 'TRANSFER_OUT' || filtered[0].type === 'FEE' ? filtered[0].amountCents : -filtered[0].amountCents) : account.balanceCents,
    closing: account.balanceCents,
  });
});
