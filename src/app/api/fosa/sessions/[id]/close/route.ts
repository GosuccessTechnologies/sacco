// Close a till — variance → GL cash short/over (guide §12.2.1).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';

const schema = z.object({ countedCashCents: z.coerce.number().int().min(0), notes: z.string().optional() });

export const POST = withPermission('fosa_session', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const s = await db.tellerSession.findUnique({ where: { id }, include: { transactions: true } });
  if (!s) return err('Session not found', 404);
  if (s.status === 'CLOSED') return err('Already closed', 409);

  const deposits = s.transactions.filter((t) => t.type === 'CASH_DEPOSIT' && t.status === 'POSTED').reduce((sum, t) => sum + t.amountCents, 0);
  const withdrawals = s.transactions.filter((t) => t.type === 'CASH_WITHDRAWAL' && t.status === 'POSTED').reduce((sum, t) => sum + t.amountCents, 0);
  const expected = s.openingFloatCents + deposits - withdrawals;
  const variance = d.countedCashCents - expected;

  const gl = await getSettings('glMap');
  await db.$transaction(async (tx) => {
    if (variance !== 0) {
      await postJournal(tx, {
        memo: `Till variance session ${id.substring(0, 8)} (${variance > 0 ? 'over' : 'short'} ${Math.abs(variance)})`,
        source: 'FOSA', postedById: session.user.id,
        lines: variance > 0
          ? [{ accountCode: gl.cashTeller, debit: variance, narration: 'Cash over' }, { accountCode: gl.cashShort, credit: variance, narration: 'Cash over' }]
          : [{ accountCode: gl.cashShort, debit: Math.abs(variance), narration: 'Cash short' }, { accountCode: gl.cashTeller, credit: Math.abs(variance), narration: 'Cash short' }],
      });
    }
    await tx.tellerSession.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), countedCashCents: d.countedCashCents, expectedCashCents: expected, varianceCents: variance, notes: d.notes ?? null },
    });
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'TILL_CLOSE', module: 'fosa', entity: 'TellerSession', entityId: id, after: { expected, counted: d.countedCashCents, variance }, severity: 'warn' });
  return ok({ expectedCashCents: expected, varianceCents: variance });
});
