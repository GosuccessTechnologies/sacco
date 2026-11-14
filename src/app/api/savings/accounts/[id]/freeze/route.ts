// Account freeze/close + standing orders — guide §9.4.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const freezeSchema = z.object({ action: z.enum(['freeze', 'unfreeze', 'close']) });

export const POST = withPermission('savings_post', async ({ req, params, session }) => {
  const { id } = params;
  const { action } = await body(req, freezeSchema);
  const account = await db.savingsAccount.findUnique({ where: { id }, include: { _count: { select: { standingOrdersFrom: true } } } });
  if (!account) return err('Account not found', 404);
  if (action === 'close') {
    if (account.balanceCents !== 0) return err('Balance must be zero before closing', 400);
    await db.savingsAccount.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
  } else {
    await db.savingsAccount.update({ where: { id }, data: { status: action === 'freeze' ? 'FROZEN' : 'OPEN' } });
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: `ACCOUNT_${action.toUpperCase()}`, module: 'savings', entity: 'SavingsAccount', entityId: id, severity: 'warn' });
  return ok({ done: true });
});

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.standingOrder.findMany({
    where: q.memberId ? { memberProfileId: q.memberId } : {},
    include: {
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } },
      fromAccount: { select: { accountNumber: true } },
      toAccount: { select: { accountNumber: true } },
    },
    orderBy: { nextRunAt: 'asc' },
  });
  return ok(rows.map((o) => ({
    id: o.id,
    member: `${o.memberProfile.firstName} ${o.memberProfile.lastName} (${o.memberProfile.memberNumber})`,
    from: o.fromAccount.accountNumber, to: o.toAccount?.accountNumber ?? o.bankInstruction ?? '—',
    destinationType: o.destinationType, amountCents: o.amountCents, dayOfMonth: o.dayOfMonth,
    nextRunAt: o.nextRunAt, active: o.active, consecutiveFailures: o.consecutiveFailures,
  })));
});

const orderSchema = z.object({
  memberProfileId: z.string(),
  fromAccountId: z.string(),
  destinationType: z.enum(['INTERNAL', 'EXTERNAL_BANK']),
  toAccountId: z.string().optional().nullable(),
  bankInstruction: z.string().optional().nullable(),
  amountCents: z.coerce.number().int().positive(),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
});

export const PUT = withPermission('savings_orders', async ({ req, session }) => {
  const d = await body(req, orderSchema);
  const next = new Date();
  next.setDate(Math.min(d.dayOfMonth, 28));
  if (next <= new Date()) next.setMonth(next.getMonth() + 1);
  const row = await db.standingOrder.create({ data: { ...d, nextRunAt: next, active: true } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'STANDING_ORDER_CREATE', module: 'savings', entity: 'StandingOrder', entityId: row.id, after: d });
  return ok(row);
});
