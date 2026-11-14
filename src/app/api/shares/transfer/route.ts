// Two-sided share transfer — guide §11.2.2.
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { transferShares } from '@/lib/shares/service';
import { audit } from '@/lib/audit';

const schema = z.object({
  fromMemberId: z.string(), toMemberId: z.string(), quantity: z.coerce.number().int().min(1), narration: z.string().optional(),
});

export const POST = withPermission('shares_transfer', async ({ req, session }) => {
  const d = await body(req, schema);
  try {
    const result = await transferShares({ ...d, performedById: session.user.id });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'SHARES_TRANSFER', module: 'shares', entity: 'ShareTransaction', entityId: result.outId, after: d, severity: 'critical' });
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
