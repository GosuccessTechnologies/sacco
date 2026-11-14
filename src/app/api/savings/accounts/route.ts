// Savings accounts — list + open + freeze/close — guide §9.4.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { openSavingsAccount } from '@/lib/savings/service';
import { audit } from '@/lib/audit';

const openSchema = z.object({
  memberProfileId: z.string(),
  productId: z.string(),
  name: z.string().optional(),
  targetCents: z.coerce.number().int().min(0).optional(),
  maturityDate: z.coerce.date().optional().nullable(),
  autoRenew: z.boolean().optional(),
});

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.savingsAccount.findMany({
    where: {
      ...(q.memberId ? { memberProfileId: q.memberId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ accountNumber: { contains: q.search } }, { memberProfile: { OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { memberNumber: { contains: q.search } }] } }] } : {}),
    },
    include: {
      product: { select: { name: true, code: true, type: true } },
      memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, status: true } },
      _count: { select: { transactions: true, standingOrdersFrom: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 500,
  });
  return ok(rows.map((a) => ({
    id: a.id, accountNumber: a.accountNumber, name: a.name ?? '',
    member: `${a.memberProfile.firstName} ${a.memberProfile.lastName} (${a.memberProfile.memberNumber})`,
    memberId: a.memberProfileId, memberStatus: a.memberProfile.status,
    product: a.product.name, productCode: a.product.code, type: a.product.type,
    balanceCents: a.balanceCents, heldFundsCents: a.heldFundsCents, interestEarnedCents: a.interestEarnedCents,
    status: a.status, maturityDate: a.maturityDate, targetCents: a.targetCents,
    openedAt: a.openedAt, lastActivityAt: a.lastActivityAt, txCount: a._count.transactions,
  })));
});

export const POST = withPermission('savings_post', async ({ req, session }) => {
  const d = await body(req, openSchema);
  try {
    const account = await openSavingsAccount({ ...d, createdById: session.user.id });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'SAVINGS_ACCOUNT_OPEN', module: 'savings', entity: 'SavingsAccount', entityId: account.id, after: { accountNumber: account.accountNumber }, severity: 'info' });
    return ok(account);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
