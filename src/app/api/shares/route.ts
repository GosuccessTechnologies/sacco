// Shares ledger — list + purchase (guide §11.4).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { purchaseShares } from '@/lib/shares/service';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.shareTransaction.findMany({
    where: q.memberId ? { memberProfileId: q.memberId } : {},
    include: { memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const sharesCfg = await getSettings('shares');
  return ok(rows.map((t) => ({
    id: t.id, certificateRef: t.certificateRef ?? '',
    member: `${t.memberProfile.firstName} ${t.memberProfile.lastName} (${t.memberProfile.memberNumber})`,
    type: t.type, quantity: t.quantity, unitPriceCents: t.unitPriceCents, amountCents: t.amountCents,
    feeCents: t.feeCents, channel: t.channel, counterparty: t.counterpartyMemberId ? 'linked' : '—',
    narration: t.narration ?? '', createdAt: t.createdAt, nominalValueCents: sharesCfg.nominalValueCents,
  })));
});

export const POST = withPermission('shares_post', async ({ req, session }) => {
  const schema = z.object({
    memberProfileId: z.string(),
    quantity: z.coerce.number().int().min(1),
    channel: z.enum(['COUNTER', 'SAVINGS', 'MPESA', 'ADMIN']),
    savingsAccountId: z.string().optional(),
    narration: z.string().optional(),
  });
  const d = await body(req, schema);
  try {
    const result = await purchaseShares({ ...d, performedById: session.user.id });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'SHARES_PURCHASE', module: 'shares', entity: 'ShareTransaction', entityId: result.shareTransactionId, after: d, severity: 'info' });
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
