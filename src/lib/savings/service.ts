// ============================================================================
// Savings engine — DEVELOPER_GUIDE.md §9.2.3 (the core ledger rule).
// ONE interactive transaction: policy validation → module ledger row →
// account balance update → balanced GL journal → notification hook.
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';
import { seqNo, nextSequence } from '@/lib/core-utils';
import { fmtMoney } from '@/lib/money';

export type SavingsChannel = 'COUNTER' | 'MPESA' | 'BANK' | 'STANDING_ORDER' | 'INTERNAL' | 'INTEREST_POSTING' | 'PAYROLL' | 'PORTAL' | 'DIVIDEND_CREDIT';
export type SavingsTxnType = 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT';

export interface PostSavingsInput {
  accountId: string;
  type: SavingsTxnType;
  channel: SavingsChannel;
  amountCents: number;
  narration?: string;
  valueDate?: Date;
  externalRef?: string;
  performedById?: string | null;
  bypassPolicy?: boolean;
}

export class SavingsPolicyError extends Error {}

function settlementCode(channel: SavingsChannel, gl: { cashTeller: string; mpesaSettlement: string; bankOperations: string; memberSavings: string }): string {
  switch (channel) {
    case 'COUNTER': return gl.cashTeller;
    case 'MPESA': return gl.mpesaSettlement;
    case 'BANK': return gl.bankOperations;
    default: return gl.memberSavings;
  }
}

const isDebitType = (t: SavingsTxnType) => t === 'WITHDRAWAL' || t === 'TRANSFER_OUT' || t === 'FEE';

/** Validate withdrawal policy — the single source (guide §9.8). */
async function validateWithdrawal(tx: typeof db, accountId: string, amountCents: number, product: { minBalanceCents: number; withdrawalPolicy: string; withdrawalPenaltyBps: number }) {
  const account = await tx.savingsAccount.findUnique({ where: { id: accountId }, include: { memberProfile: true } });
  if (!account) throw new SavingsPolicyError('Account not found');
  if (account.status === 'CLOSED') throw new SavingsPolicyError('Account is closed');
  if (account.memberProfile.status === 'BLACKLISTED') throw new SavingsPolicyError('Member is blacklisted');
  if (account.status === 'FROZEN') throw new SavingsPolicyError('Account is frozen (active loan collateral)');
  if (account.heldFundsCents > 0) {
    const available = account.balanceCents - account.heldFundsCents - product.minBalanceCents;
    if (amountCents > available) {
      throw new SavingsPolicyError(`Guarantee hold active — available ${fmtMoney(Math.max(0, available))} after holds`);
    }
  }
  const after = account.balanceCents - amountCents;
  if (after < product.minBalanceCents) {
    throw new SavingsPolicyError(`Below minimum balance (${fmtMoney(product.minBalanceCents)})`);
  }
  if (product.withdrawalPolicy === 'LOCKED_UNTIL_MATURITY' && account.maturityDate && account.maturityDate > new Date()) {
    throw new SavingsPolicyError('Funds are locked until maturity for this product');
  }
  let penaltyCents = 0;
  if (product.withdrawalPolicy === 'PENALTY' && product.withdrawalPenaltyBps > 0) {
    penaltyCents = Math.round((amountCents * product.withdrawalPenaltyBps) / 10_000);
  }
  return { account, penaltyCents };
}

/** Post a savings transaction atomically. */
export async function postSavingsTransaction(input: PostSavingsInput) {
  const gl = await getSettings('glMap');
  return db.$transaction(async (tx) => {
    const account = await tx.savingsAccount.findUnique({
      where: { id: input.accountId },
      include: { product: true, memberProfile: true },
    });
    if (!account) throw new SavingsPolicyError('Account not found');
    if (account.status === 'CLOSED') throw new SavingsPolicyError('Account is closed');

    let penaltyCents = 0;
    if (isDebitType(input.type) && !input.bypassPolicy) {
      const v = await validateWithdrawal(tx, input.accountId, input.amountCents, account.product);
      penaltyCents = v.penaltyCents;
    }
    if (account.status === 'DORMANT') {
      await tx.savingsAccount.update({ where: { id: account.id }, data: { status: 'OPEN' } });
    }

    const delta = isDebitType(input.type) ? -(input.amountCents + penaltyCents) : input.amountCents;
    const balanceAfter = account.balanceCents + delta;
    if (balanceAfter < 0) throw new SavingsPolicyError('Insufficient funds');

    const reference = `PAY-${seqNo('')}`;
    const row = await tx.savingsTransaction.create({
      data: {
        reference,
        accountId: account.id,
        memberProfileId: account.memberProfileId,
        type: input.type,
        channel: input.channel,
        amountCents: input.amountCents + penaltyCents,
        balanceAfterCents: balanceAfter,
        valueDate: input.valueDate ?? new Date(),
        narration: input.narration ?? `${input.type} via ${input.channel}`,
        externalRef: input.externalRef ?? null,
        status: 'COMPLETED',
        performedById: input.performedById ?? null,
      },
    });
    await tx.savingsAccount.update({
      where: { id: account.id },
      data: {
        balanceCents: balanceAfter,
        lastActivityAt: new Date(),
        ...(input.type === 'INTEREST' ? { interestEarnedCents: { increment: input.amountCents } } : {}),
      },
    });

    // ---- GL pair (guide §9.2.3)
    const settle = settlementCode(input.channel, gl);
    const liability = gl.memberSavings;
    const credit = !isDebitType(input.type);
    const journalId = await postJournal(tx, {
      memo: `${input.type} ${account.accountNumber} (${account.memberProfile.memberNumber}) ref ${reference}`,
      source: 'SAVINGS',
      sourceRef: reference,
      postedById: input.performedById ?? null,
      lines: credit
        ? [
            { accountCode: input.channel === 'INTERNAL' ? liability : settle, debit: input.amountCents },
            { accountCode: liability, credit: input.amountCents },
          ]
        : [
            { accountCode: liability, debit: input.amountCents + penaltyCents },
            ...(penaltyCents > 0 ? [{ accountCode: gl.feeIncome, credit: penaltyCents, narration: 'Early withdrawal penalty' }] : []),
            { accountCode: input.channel === 'INTERNAL' ? liability : settle, credit: input.amountCents },
          ],
    });
    await tx.savingsTransaction.update({ where: { id: row.id }, data: { journalEntryId: journalId } });

    return {
      transactionId: row.id, reference, balanceAfterCents: balanceAfter,
      journalEntryId: journalId, penaltyCents,
      memberId: account.memberProfileId, accountNumber: account.accountNumber,
    };
  });
}

/** Reverse a completed transaction with a contra entry (immutable ledger). */
export async function reverseSavingsTransaction(transactionId: string, reason: string, performedById?: string | null) {
  const gl = await getSettings('glMap');
  return db.$transaction(async (tx) => {
    const orig = await tx.savingsTransaction.findUnique({ where: { id: transactionId }, include: { account: true } });
    if (!orig) throw new SavingsPolicyError('Transaction not found');
    if (orig.status === 'REVERSED') throw new SavingsPolicyError('Already reversed');

    const credit = !isDebitType(orig.type as SavingsTxnType);
    const delta = credit ? -orig.amountCents : orig.amountCents;
    const account = await tx.savingsAccount.findUnique({ where: { id: orig.accountId } });
    if (!account || account.balanceCents + delta < 0) {
      throw new SavingsPolicyError('Cannot reverse — balance would go negative');
    }
    const reference = `PAY-${seqNo('')}`;
    const row = await tx.savingsTransaction.create({
      data: {
        reference,
        accountId: orig.accountId,
        memberProfileId: orig.memberProfileId,
        type: 'REVERSAL',
        channel: orig.channel,
        amountCents: orig.amountCents,
        balanceAfterCents: account.balanceCents + delta,
        valueDate: new Date(),
        narration: `Reversal of ${orig.reference}: ${reason}`,
        linkedTransactionId: orig.id,
        status: 'COMPLETED',
        performedById: performedById ?? null,
      },
    });
    await tx.savingsAccount.update({
      where: { id: orig.accountId },
      data: { balanceCents: { increment: delta }, lastActivityAt: new Date() },
    });
    const settle = settlementCode(orig.channel as SavingsChannel, gl);
    const journalId = await postJournal(tx, {
      memo: `REVERSAL savings ${orig.reference}`,
      source: 'SAVINGS',
      sourceRef: reference,
      postedById: performedById ?? null,
      lines: credit
        ? [
            { accountCode: orig.channel === 'INTERNAL' ? gl.memberSavings : settle, debit: orig.amountCents },
            { accountCode: gl.memberSavings, credit: orig.amountCents },
          ]
        : [
            { accountCode: gl.memberSavings, debit: orig.amountCents },
            { accountCode: orig.channel === 'INTERNAL' ? gl.memberSavings : settle, credit: orig.amountCents },
          ],
    });
    await tx.savingsTransaction.update({ where: { id: row.id }, data: { journalEntryId: journalId } });
    await tx.savingsTransaction.update({ where: { id: orig.id }, data: { status: 'REVERSED' } });
    return { reversalId: row.id, reference };
  });
}

/** Open a new savings account (sequence DIVS-xxxxxx). */
export async function openSavingsAccount(opts: {
  memberProfileId: string; productId: string; name?: string; targetCents?: number;
  maturityDate?: Date; autoRenew?: boolean; createdById?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const member = await tx.memberProfile.findUnique({ where: { id: opts.memberProfileId } });
    const product = await tx.savingsProduct.findUnique({ where: { id: opts.productId } });
    if (!member) throw new SavingsPolicyError('Member not found');
    if (!product || !product.active) throw new SavingsPolicyError('Product not available');
    if (member.status !== 'ACTIVE') throw new SavingsPolicyError('Member must be ACTIVE to open accounts');
    const accountNumber = await nextSequence(tx, 'savings');
    return tx.savingsAccount.create({
      data: {
        accountNumber,
        memberProfileId: opts.memberProfileId,
        productId: opts.productId,
        name: opts.name ?? null,
        targetCents: opts.targetCents ?? null,
        maturityDate: opts.maturityDate ?? null,
        autoRenew: opts.autoRenew ?? false,
        createdById: opts.createdById ?? null,
      },
    });
  });
}
