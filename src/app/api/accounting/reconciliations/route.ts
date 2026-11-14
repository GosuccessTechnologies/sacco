// Reconciliations — create + approve (period lock) — guide §13.2.5.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.bankReconciliation.findMany({
    where: q.bankId ? { bankAccountId: q.bankId } : {},
    include: { bankAccount: { select: { name: true, bankName: true } } },
    orderBy: { periodTo: 'desc' },
  });
  return ok(rows.map((r) => ({
    id: r.id, bank: `${r.bankAccount.bankName} — ${r.bankAccount.name}`,
    periodFrom: r.periodFrom, periodTo: r.periodTo,
    statementBalanceCents: r.statementBalanceCents, systemBalanceCents: r.systemBalanceCents,
    differenceCents: r.differenceCents, status: r.status, approvedAt: r.approvedAt,
  })));
});

const schema = z.object({
  bankId: z.string(),
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  statementBalanceCents: z.coerce.number().int(),
});

export const POST = withPermission('accounting_reconcile', async ({ req, session }) => {
  const d = await body(req, schema);
  const bank = await db.bankAccount.findUnique({ where: { id: d.bankId }, include: { glAccount: true } });
  if (!bank) return err('Bank not found', 404);
  // system balance from GL over the period lines
  const lines = await db.journalLine.findMany({
    where: { glAccount: { id: bank.glAccountId }, journalEntry: { date: { lte: d.periodTo } } },
    select: { debitCents: true, creditCents: true },
  });
  const system = bank.openingBalanceCents + lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0);
  const row = await db.bankReconciliation.create({
    data: {
      bankAccountId: d.bankId, periodFrom: d.periodFrom, periodTo: d.periodTo,
      statementBalanceCents: d.statementBalanceCents, systemBalanceCents: system,
      differenceCents: d.statementBalanceCents - system, status: 'DRAFT', performedById: session.user.id,
    },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'RECON_CREATE', module: 'accounting', entity: 'BankReconciliation', entityId: row.id, after: { difference: row.differenceCents }, severity: 'info' });
  return ok(row);
});
