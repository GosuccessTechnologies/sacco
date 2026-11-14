// FOSA teller sessions — open/close with variance posting (guide §12.2.1).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';
import { nextSequence } from '@/lib/core-utils';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.tellerSession.findMany({
    where: q.userId ? { userId: q.userId } : {},
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { transactions: true } },
      transactions: { select: { type: true, amountCents: true, status: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 200,
  });
  return ok(rows.map((s) => {
    const deposits = s.transactions.filter((t) => t.type === 'CASH_DEPOSIT' && t.status === 'POSTED').reduce((sum, t) => sum + t.amountCents, 0);
    const withdrawals = s.transactions.filter((t) => t.type === 'CASH_WITHDRAWAL' && t.status === 'POSTED').reduce((sum, t) => sum + t.amountCents, 0);
    const expected = s.openingFloatCents + deposits - withdrawals;
    return {
      id: s.id, teller: s.user.name, status: s.status, openedAt: s.openedAt, closedAt: s.closedAt,
      openingFloatCents: s.openingFloatCents, countedCashCents: s.countedCashCents ?? null,
      expectedCashCents: s.status === 'CLOSED' ? (s.expectedCashCents ?? expected) : expected,
      varianceCents: s.varianceCents ?? null, txCount: s._count.transactions,
      depositsCents: deposits, withdrawalsCents: withdrawals, notes: s.notes ?? '',
    };
  }));
});

export const POST = withPermission('fosa_session', async ({ req, session }) => {
  const schema = z.object({ action: z.enum(['open']), openingFloatCents: z.coerce.number().int().min(0) });
  const { openingFloatCents } = await body(req, schema);
  const existing = await db.tellerSession.findFirst({ where: { userId: session.user.id, status: 'OPEN' } });
  if (existing) return err('You already have an open till. Close it first.', 409);
  const row = await db.tellerSession.create({
    data: { userId: session.user.id, openingFloatCents, status: 'OPEN', createdById: session.user.id },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'TILL_OPEN', module: 'fosa', entity: 'TellerSession', entityId: row.id, after: { openingFloatCents }, severity: 'info' });
  return ok(row);
});
