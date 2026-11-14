// Reverse a savings transaction — guide §9.4 (immutable ledger, contra entries).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { reverseSavingsTransaction } from '@/lib/savings/service';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { notifyPerson } from '@/lib/notify';

const schema = z.object({ reason: z.string().min(3) });

export const POST = withPermission('savings_reverse', async ({ req, params, session }) => {
  const { id } = params;
  const { reason } = await body(req, schema);
  try {
    const result = await reverseSavingsTransaction(id, reason, session.user.id);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'SAVINGS_REVERSE', module: 'savings', entity: 'SavingsTransaction', entityId: id, before: { id }, after: result, severity: 'critical' });
    const orig = await db.savingsTransaction.findUnique({ where: { id }, include: { account: { include: { memberProfile: true } } } });
    if (orig) {
      await notifyPerson(
        { name: orig.account.memberProfile.firstName, email: orig.account.memberProfile.email, phone: orig.account.memberProfile.phone },
        'savings_withdrawal_alert',
        { name: orig.account.memberProfile.firstName, accountNumber: orig.account.accountNumber, amount: 'reversed', channel: 'office correction', balance: '' },
      ).catch(() => null);
    }
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
