// Match/unmatch a statement line against a journal line (guide §13.2.5).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  action: z.enum(['match', 'unmatch', 'auto_match']),
  journalLineId: z.string().optional(),
});

export const POST = withPermission('accounting_reconcile', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const line = await db.bankStatementLine.findUnique({ where: { id } });
  if (!line) return err('Line not found', 404);

  if (d.action === 'match') {
    if (!d.journalLineId) return err('journalLineId required', 422);
    const jl = await db.journalLine.findUnique({ where: { id: d.journalLineId }, include: { journalEntry: true } });
    if (!jl) return err('Journal line not found', 404);
    await db.bankStatementLine.update({ where: { id }, data: { matchedJournalLineId: d.journalLineId, status: 'MATCHED' } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'RECON_MATCH', module: 'accounting', entity: 'BankStatementLine', entityId: id, after: { journalLineId: d.journalLineId }, severity: 'info' });
    return ok({ status: 'MATCHED' });
  }

  if (d.action === 'unmatch') {
    await db.bankStatementLine.update({ where: { id }, data: { matchedJournalLineId: null, status: 'UNRECONCILED' } });
    return ok({ status: 'UNRECONCILED' });
  }

  // auto-match: amount + date window ±3d on this bank's GL lines
  const bank = await db.bankAccount.findUnique({ where: { id: line.bankAccountId } });
  if (!bank) return err('Bank not found', 404);
  const allLines = await db.journalLine.findMany({
    where: { glAccount: { id: bank.glAccountId } },
    include: { journalEntry: true },
    take: 500,
  });
  const target = allLines.find((l) =>
    Math.abs((l.debitCents || l.creditCents) - Math.abs(line.amountCents)) === 0 &&
    Math.abs(l.journalEntry.date.getTime() - line.statementDate.getTime()) <= 3 * 86400000,
  );
  if (!target) return err('No automatic match found — match manually', 404);
  await db.bankStatementLine.update({ where: { id }, data: { matchedJournalLineId: target.id, status: 'MATCHED' } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'RECON_AUTO_MATCH', module: 'accounting', entity: 'BankStatementLine', entityId: id, after: { journalLineId: target.id }, severity: 'info' });
  return ok({ status: 'MATCHED', journalLineId: target.id, entry: target.journalEntry.entryNo });
});
