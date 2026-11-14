// Journal — list + manual balanced entry (guide §13.2.2/§13.4).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting/posting';
import { audit } from '@/lib/audit';

export const GET = withAuth('accounting_journal', async ({ req }) => {
  const q = query(req);
  const rows = await db.journalEntry.findMany({
    where: {
      ...(q.source ? { source: q.source } : {}),
      ...(q.from || q.to ? { date: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
      ...(q.search ? { OR: [{ entryNo: { contains: q.search } }, { memo: { contains: q.search } }, { sourceRef: { contains: q.search } }] } : {}),
    },
    include: { lines: { include: { glAccount: { select: { code: true, name: true } } } } },
    orderBy: { date: 'desc' },
    take: 400,
  });
  return ok(rows.map((e) => ({
    id: e.id, entryNo: e.entryNo, date: e.date, source: e.source, sourceRef: e.sourceRef ?? '',
    memo: e.memo, status: e.status,
    totalCents: e.lines.reduce((s, l) => s + l.debitCents, 0),
    lines: e.lines.map((l) => ({
      account: `${l.glAccount.code} ${l.glAccount.name}`,
      debitCents: l.debitCents, creditCents: l.creditCents, narration: l.narration ?? '',
    })),
  })));
});

const schema = z.object({
  memo: z.string().min(3),
  date: z.coerce.date().default(() => new Date()),
  lines: z.array(z.object({
    accountCode: z.string(),
    debitCents: z.coerce.number().int().min(0),
    creditCents: z.coerce.number().int().min(0),
    narration: z.string().optional(),
  })).min(2),
});

export const POST = withPermission('accounting_journal_manual', async ({ req, session }) => {
  const d = await body(req, schema);
  try {
    const entryId = await db.$transaction((tx) => postJournal(tx, {
      memo: d.memo, date: d.date, source: 'MANUAL', postedById: session.user.id, lines: d.lines,
    }));
    const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'JOURNAL_MANUAL', module: 'accounting', entity: 'JournalEntry', entityId: entryId, after: { entryNo: entry?.entryNo }, severity: 'warn' });
    return ok({ entryId, entryNo: entry?.entryNo });
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
