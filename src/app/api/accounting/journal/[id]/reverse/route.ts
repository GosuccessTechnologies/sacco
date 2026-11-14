// Reverse a journal entry — guide §13.2.2 (contra, immutable).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { reverseJournal } from '@/lib/accounting/posting';
import { audit } from '@/lib/audit';

export const POST = withPermission('accounting_reverse', async ({ req, params, session }) => {
  const { id } = params;
  const { reason } = await body(req, z.object({ reason: z.string().min(3) }));
  try {
    const reversalId = await db.$transaction((tx) => reverseJournal(tx, id, reason, session.user.id));
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'JOURNAL_REVERSE', module: 'accounting', entity: 'JournalEntry', entityId: id, after: { reason, reversalId }, severity: 'critical' });
    return ok({ reversalId });
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
