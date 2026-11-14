// ============================================================================
// Shares & dividends engine — DEVELOPER_GUIDE.md §11.2
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';
import { nextSequence } from '@/lib/core-utils';

export class SharesError extends Error {}

// ---------------------------------------------------------------- purchase
export async function purchaseShares(opts: {
  memberProfileId: string; quantity: number;
  channel: 'COUNTER' | 'SAVINGS' | 'MPESA' | 'ADMIN' | 'PORTAL';
  performedById?: string | null; narration?: string;
  savingsAccountId?: string; externalRef?: string;
}) {
  const shares = await getSettings('shares');
  return db.$transaction(async (tx) => {
    const member = await tx.memberProfile.findUnique({ where: { id: opts.memberProfileId }, include: { sharePosition: true } });
    if (!member) throw new SharesError('Member not found');
    if (member.status !== 'ACTIVE') throw new SharesError('Member must be ACTIVE');
    if (opts.quantity < 1) throw new SharesError('Minimum 1 share');

    const unitPrice = shares.nominalValueCents;
    const amount = opts.quantity * unitPrice;
    const ref = await nextSequence(tx, 'share');

    // funding leg
    if (opts.channel === 'SAVINGS' && opts.savingsAccountId) {
      const { postSavingsTransaction } = await import('@/lib/savings/service');
      await postSavingsTransaction({
        accountId: opts.savingsAccountId, type: 'TRANSFER_OUT', channel: 'INTERNAL',
        amountCents: amount, narration: `Share purchase (${opts.quantity} shares)`, performedById: opts.performedById ?? null,
      }).catch((e) => { throw new SharesError((e as Error).message); });
    }

    const gl = await getSettings('glMap');
    const settle = opts.channel === 'COUNTER' ? gl.cashTeller : opts.channel === 'MPESA' ? gl.mpesaSettlement : gl.shareCapital;
    const journalId = await postJournal(tx, {
      memo: `Share purchase ${ref} — ${member.memberNumber} (${opts.quantity} × ${unitPrice})`,
      source: 'SHARES', sourceRef: ref, postedById: opts.performedById ?? null,
      lines: [
        { accountCode: opts.channel === 'SAVINGS' ? gl.memberSavings : settle, debit: amount, narration: 'Funding' },
        { accountCode: gl.shareCapital, credit: amount, narration: 'Share capital' },
      ],
    });

    const txn = await tx.shareTransaction.create({
      data: {
        certificateRef: ref, memberProfileId: member.id, type: 'PURCHASE',
        quantity: opts.quantity, unitPriceCents: unitPrice, amountCents: amount,
        channel: opts.channel, narration: opts.narration ?? 'Share purchase',
        journalEntryId: journalId, performedById: opts.performedById ?? null,
      },
    });
    await upsertPosition(tx, member.id, opts.quantity, amount);
    return { shareTransactionId: txn.id, certificateRef: ref, amount };
  });
}

async function upsertPosition(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], memberProfileId: string, qtyDelta: number, valueDelta: number) {
  const existing = await tx.memberSharePosition.findUnique({ where: { memberProfileId } });
  if (!existing) {
    await tx.memberSharePosition.create({
      data: { memberProfileId, totalShares: Math.max(0, qtyDelta), totalValueCents: Math.max(0, valueDelta) },
    });
  } else {
    await tx.memberSharePosition.update({
      where: { memberProfileId },
      data: { totalShares: { increment: qtyDelta }, totalValueCents: { increment: valueDelta } },
    });
  }
}

// ---------------------------------------------------------------- transfer (two-sided)
export async function transferShares(opts: {
  fromMemberId: string; toMemberId: string; quantity: number;
  performedById: string; narration?: string;
}) {
  const shares = await getSettings('shares');
  if (!shares.allowTransfers) throw new SharesError('Transfers are disabled');
  const fee = shares.transferFeeCents;
  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.memberProfile.findUnique({ where: { id: opts.fromMemberId }, include: { sharePosition: true } }),
      tx.memberProfile.findUnique({ where: { id: opts.toMemberId }, include: { sharePosition: true } }),
    ]);
    if (!from || !to) throw new SharesError('Member not found');
    if (from.id === to.id) throw new SharesError('Cannot transfer to the same member');
    if ((from.sharePosition?.totalShares ?? 0) - opts.quantity < shares.minSharesForMembership) {
      throw new SharesError('Seller would fall below the minimum shareholding');
    }
    const value = opts.quantity * shares.nominalValueCents;
    const ref = await nextSequence(tx, 'share');
    const gl = await getSettings('glMap');
    const journalId = fee > 0 ? await postJournal(tx, {
      memo: `Share transfer fee ${ref}`,
      source: 'SHARES', sourceRef: ref, postedById: opts.performedById,
      lines: [
        { accountCode: gl.memberSavings, debit: fee, narration: 'Transfer fee (seller)' },
        { accountCode: gl.feeIncome, credit: fee },
      ],
    }) : null;

    const out = await tx.shareTransaction.create({
      data: {
        certificateRef: `${ref}-OUT`, memberProfileId: from.id, type: 'TRANSFER_OUT',
        quantity: opts.quantity, unitPriceCents: shares.nominalValueCents,
        amountCents: value, feeCents: fee, counterpartyMemberId: to.id,
        channel: 'ADMIN', narration: opts.narration ?? 'Share transfer out',
        journalEntryId: journalId, performedById: opts.performedById,
      },
    });
    await tx.shareTransaction.create({
      data: {
        certificateRef: `${ref}-IN`, memberProfileId: to.id, type: 'TRANSFER_IN',
        quantity: opts.quantity, unitPriceCents: shares.nominalValueCents,
        amountCents: value, counterpartyMemberId: from.id,
        channel: 'ADMIN', narration: opts.narration ?? 'Share transfer in', performedById: opts.performedById,
      },
    });
    // update in deterministic id order (deadlock avoidance — guide §11.8)
    const ids = [from.id, to.id].sort();
    for (const id of ids) {
      const isIn = id === to.id;
      await upsertPosition(tx, id, isIn ? opts.quantity : -opts.quantity, isIn ? value : -value);
    }
    return { outId: out.id, ref };
  });
}

// ---------------------------------------------------------------- dividends
export interface DividendComputation {
  entries: { memberProfileId: string; sharesHeld: number; avgSavingsCents: number; shareDividendCents: number; depositInterestCents: number; totalPayoutCents: number }[];
}

/** Compute a dividend run — guide §11.2.3. Deterministic; residual to largest holder. */
export async function computeDividendRun(runId: string) {
  const run = await db.dividendRun.findUnique({ where: { id: runId } });
  if (!run) throw new SharesError('Run not found');
  if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') throw new SharesError('Run is locked');

  const members = await db.memberProfile.findMany({
    where: { status: 'ACTIVE' },
    include: { sharePosition: true, savingsAccounts: true },
  });
  const totalShares = members.reduce((s, m) => s + (m.sharePosition?.totalShares ?? 0), 0);
  const pool = run.totalPoolCents;
  if (totalShares === 0 || pool === 0) throw new SharesError('No shareholders or empty pool');

  // avg savings per member (current balances as the proxy for the year)
  const avgSavings = new Map(members.map((m) => [m.id, m.savingsAccounts.reduce((s, a) => s + a.balanceCents, 0)]));
  const totalSavings = [...avgSavings.values()].reduce((s, v) => s + v, 0);

  const entries = members.map((m) => {
    const sharesHeld = m.sharePosition?.totalShares ?? 0;
    const avg = avgSavings.get(m.id) ?? 0;
    let shareDiv = 0, depositInt = 0;
    if (run.method === 'PROPORTIONAL_SHARES') shareDiv = Math.floor((pool * sharesHeld) / totalShares);
    else if (run.method === 'SAVINGS_WEIGHTED') depositInt = totalSavings > 0 ? Math.floor((pool * avg) / totalSavings) : 0;
    else { // HYBRID
      shareDiv = Math.floor(((pool / 2) * sharesHeld) / totalShares);
      depositInt = totalSavings > 0 ? Math.floor(((pool / 2) * avg) / totalSavings) : 0;
    }
    return { memberProfileId: m.id, sharesHeld, avgSavingsCents: avg, shareDividendCents: shareDiv, depositInterestCents: depositInt, totalPayoutCents: shareDiv + depositInt };
  });

  // residual true-up to the largest holder (Σ = pool invariant)
  const sum = entries.reduce((s, e) => s + e.totalPayoutCents, 0);
  if (sum !== pool && entries.length) {
    const largest = entries.reduce((a, b) => (a.totalPayoutCents >= b.totalPayoutCents ? a : b));
    const diff = pool - sum;
    if (largest.shareDividendCents + diff >= 0) largest.shareDividendCents += diff;
    else largest.depositInterestCents += diff;
    largest.totalPayoutCents += diff;
  }

  return { entries, totalShares, pool } satisfies DividendComputation & { totalShares: number; pool: number };
}

/** Persist computed entries (CALCULATED). */
export async function persistDividendEntries(runId: string) {
  const computed = await computeDividendRun(runId);
  await db.$transaction(async (tx) => {
    await tx.dividendEntry.deleteMany({ where: { runId } });
    await tx.dividendEntry.createMany({
      data: computed.entries.filter((e) => e.totalPayoutCents > 0).map((e) => ({
        runId, memberProfileId: e.memberProfileId, sharesHeld: e.sharesHeld,
        avgSavingsCents: e.avgSavingsCents, shareDividendCents: e.shareDividendCents,
        depositInterestCents: e.depositInterestCents, totalPayoutCents: e.totalPayoutCents,
      })),
    });
    await tx.dividendRun.update({
      where: { id: runId },
      data: { status: 'CALCULATED', computedAt: new Date() },
    });
  });
  return computed;
}

/** Pay a dividend run into members' main savings accounts. */
export async function payDividendRun(runId: string, performedById: string) {
  const run = await db.dividendRun.findUnique({ where: { id: runId }, include: { entries: { include: { memberProfile: true } } } });
  if (!run) throw new SharesError('Run not found');
  if (run.status !== 'APPROVED') throw new SharesError('Run must be APPROVED before paying');
  const gl = await getSettings('glMap');
  const { postSavingsTransaction } = await import('@/lib/savings/service');

  for (const e of run.entries) {
    if (e.totalPayoutCents <= 0) continue;
    await db.$transaction(async (tx) => {
      const main = await tx.savingsAccount.findFirst({ where: { memberProfileId: e.memberProfileId }, orderBy: { openedAt: 'asc' } });
      if (!main) return;
      const ref = `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const balanceAfter = main.balanceCents + e.totalPayoutCents;
      const row = await tx.savingsTransaction.create({
        data: {
          reference: ref, accountId: main.id, memberProfileId: e.memberProfileId,
          type: 'DEPOSIT', channel: 'DIVIDEND_CREDIT', amountCents: e.totalPayoutCents,
          balanceAfterCents: balanceAfter, valueDate: new Date(),
          narration: `Dividend ${run.year} payout`, status: 'COMPLETED', performedById,
        },
      });
      await tx.savingsAccount.update({ where: { id: main.id }, data: { balanceCents: balanceAfter, lastActivityAt: new Date() } });
      const journalId = await postJournal(tx, {
        memo: `Dividend ${run.year} payout — ${e.memberProfile.memberNumber}`,
        source: 'DIVIDEND', sourceRef: ref, postedById: performedById,
        lines: [
          { accountCode: gl.dividendExpense, debit: e.totalPayoutCents },
          { accountCode: gl.memberSavings, credit: e.totalPayoutCents },
        ],
      });
      await tx.savingsTransaction.update({ where: { id: row.id }, data: { journalEntryId: journalId } });
      await tx.dividendEntry.update({
        where: { id: e.id },
        data: { payoutChannel: 'SAVINGS_CREDIT', payoutRef: ref, paidAt: new Date(), journalEntryId: journalId },
      });
    });
  }
  await db.dividendRun.update({ where: { id: runId }, data: { status: 'PAID', paidAt: new Date() } });
  return { paid: run.entries.length };
}
