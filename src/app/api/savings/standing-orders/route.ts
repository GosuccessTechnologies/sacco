// Standing orders — GET list + PUT create (guide §9.4).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => {
  const rows = await db.standingOrder.findMany({
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
