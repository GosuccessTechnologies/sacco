// ============================================================================
// GL Posting engine — DEVELOPER_GUIDE.md §13.2.2. THE ONLY writer of JournalLine.
// postJournal() must be called inside the caller's interactive transaction.
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { nextSequence } from '@/lib/core-utils';
import type { Prisma } from '@prisma/client';
import type { GlMapConfig } from '@/lib/settings';

type Tx = Prisma.TransactionClient;

export interface PostLineInput { accountCode: string; debit?: number; credit?: number; narration?: string }

export interface PostInput {
  date?: Date;
  memo: string;
  source: string;
  sourceRef?: string;
  lines: PostLineInput[];
  postedById?: string | null;
}

export class PostingError extends Error {}

/** Post a balanced journal entry. Returns the entry id (for caller linkage). */
export async function postJournal(tx: Tx, input: PostInput): Promise<string> {
  const lines = input.lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  if (lines.length < 2) throw new PostingError('A journal needs at least two lines');

  const accounts = await tx.glAccount.findMany({ where: { active: true } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  for (const l of lines) {
    const acc = byCode.get(l.accountCode);
    if (!acc) throw new PostingError(`GL account ${l.accountCode} not found`);
    if (!acc.isPostable) throw new PostingError(`GL account ${acc.code} (${acc.name}) is not postable`);
  }
  const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (totalDebit !== totalCredit) {
    throw new PostingError(`Unbalanced journal: debit ${totalDebit} ≠ credit ${totalCredit}`);
  }

  const entryNo = await nextSequence(tx, 'journal');
  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: input.date ?? new Date(),
      memo: input.memo,
      source: input.source,
      sourceRef: input.sourceRef,
      postedById: input.postedById ?? null,
    },
  });

  await tx.journalLine.createMany({
    data: lines.map((l) => {
      const acc = byCode.get(l.accountCode)!;
      return {
        journalEntryId: entry.id,
        glAccountId: acc.id,
        debitCents: l.debit ?? 0,
        creditCents: l.credit ?? 0,
        narration: l.narration ?? input.memo,
      };
    }),
  });

  // maintain cached balances (signed normal balance)
  for (const l of lines) {
    const acc = byCode.get(l.accountCode)!;
    const signed = acc.type === 'ASSET' || acc.type === 'EXPENSE' ? (l.debit ?? 0) - (l.credit ?? 0) : (l.credit ?? 0) - (l.debit ?? 0);
    await tx.glAccount.update({
      where: { id: acc.id },
      data: { cachedBalanceCents: { increment: signed } },
    });
  }
  return entry.id;
}

/** Reverse an existing entry with a contra entry. Returns reversal entry id. */
export async function reverseJournal(tx: Tx, entryId: string, reason: string, postedById?: string | null): Promise<string> {
  const entry = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!entry) throw new PostingError('Entry not found');
  if (entry.status === 'REVERSED') throw new PostingError('Entry already reversed');
  const accounts = await tx.glAccount.findMany({});
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const revId = await postJournal(tx, {
    date: new Date(),
    memo: `REVERSAL of ${entry.entryNo}: ${reason}`,
    source: entry.source,
    sourceRef: entry.sourceRef ?? undefined,
    postedById,
    lines: entry.lines.map((l) => ({
      accountCode: byId.get(l.glAccountId)!.code,
      debit: l.creditCents,
      credit: l.debitCents,
      narration: l.narration ?? undefined,
    })),
  });
  await tx.journalEntry.update({ where: { id: entry.id }, data: { status: 'REVERSED', reversedEntryId: revId } });
  return revId;
}

/** Convenience: the module→GL code map. */
export async function glMap(): Promise<GlMapConfig> {
  return getSettings('glMap');
}
