// ============================================================================
// Loans engine — DEVELOPER_GUIDE.md §10.2 (state machine, guarantors,
// amortization, allocation waterfall, disbursement, actions).
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';
import { nextSequence, seqNo } from '@/lib/core-utils';
import { bpsToMonthly, emiCents, roundMoney } from '@/lib/money';
import { notifyPerson, inAppNotify } from '@/lib/notify';

export class LoanError extends Error {}

// ---------------------------------------------------------------- amortization
export interface ScheduleRow {
  installmentNo: number; dueDate: Date;
  principalDueCents: number; interestDueCents: number; totalDueCents: number;
}

/** Build the repayment schedule — guide §10.2.7 (integer cents, residual absorbed last). */
export function buildSchedule(
  principalCents: number, interestRateBps: number, termMonths: number,
  method: 'REDUCING' | 'FLAT', startDate: Date, graceDays = 0,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const r = bpsToMonthly(interestRateBps);
  const firstDue = new Date(startDate);
  firstDue.setMonth(firstDue.getMonth() + 1);
  firstDue.setDate(firstDue.getDate() + graceDays);

  if (method === 'FLAT') {
    const totalInterest = Math.round((principalCents * (interestRateBps / 100) * termMonths) / 12 / 100);
    const interestPer = Math.floor(totalInterest / termMonths);
    const principalPer = Math.floor(principalCents / termMonths);
    let paidPrincipal = 0, paidInterest = 0;
    for (let k = 1; k <= termMonths; k++) {
      const isLast = k === termMonths;
      const principal = isLast ? principalCents - paidPrincipal : principalPer;
      const interest = isLast ? totalInterest - paidInterest : interestPer;
      const due = new Date(firstDue); due.setMonth(due.getMonth() + (k - 1));
      rows.push({ installmentNo: k, dueDate: due, principalDueCents: principal, interestDueCents: interest, totalDueCents: principal + interest });
      paidPrincipal += principal; paidInterest += interest;
    }
    return rows;
  }

  // REDUCING (annuity) — integer math with residual absorption
  const emi = emiCents(principalCents, r, termMonths);
  let outstanding = principalCents;
  let sumPrincipal = 0;
  for (let k = 1; k <= termMonths; k++) {
    const isLast = k === termMonths;
    const interest = roundMoney(outstanding * r);
    let principal = isLast ? principalCents - sumPrincipal : emi - interest;
    if (principal < 0) principal = 0; // pathological ultra-low rates
    if (isLast) principal = principalCents - sumPrincipal;
    const due = new Date(firstDue); due.setMonth(due.getMonth() + (k - 1));
    rows.push({ installmentNo: k, dueDate: due, principalDueCents: principal, interestDueCents: interest, totalDueCents: principal + interest });
    outstanding -= principal; sumPrincipal += principal;
  }
  return rows;
}

// ---------------------------------------------------------------- eligibility
export async function checkEligibility(memberProfileId: string, productCodeOrId: string, requestedCents: number, termMonths: number) {
  const limits = await getSettings('limits');
  const member = await db.memberProfile.findUnique({
    where: { id: memberProfileId },
    include: {
      savingsAccounts: { include: { product: true } },
      loans: { where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } } },
      sharePosition: true,
    },
  });
  if (!member) throw new LoanError('Member not found');
  if (member.status !== 'ACTIVE') throw new LoanError(`Member status is ${member.status} — must be ACTIVE`);
  if (!member.kycVerified) throw new LoanError('KYC not verified — loans require verified KYC');
  const product = await db.loanProduct.findFirst({
    where: { OR: [{ id: productCodeOrId }, { code: productCodeOrId }], active: true },
  });
  if (!product) throw new LoanError('Loan product not found');

  const savingsTotal = member.savingsAccounts.reduce((s, a) => s + a.balanceCents, 0);
  const multiplierCap = savingsTotal * product.savingsMultiplier;
  if (requestedCents > multiplierCap) {
    throw new LoanError(`Requested exceeds ${product.savingsMultiplier}x savings (${savingsTotal ? 'x' : ''}${savingsTotal} → cap)`);
  }
  if (requestedCents < product.minAmountCents || requestedCents > product.maxAmountCents) {
    throw new LoanError('Amount outside product limits');
  }
  if (termMonths < product.termMinMonths || termMonths > product.termMaxMonths) {
    throw new LoanError('Term outside product limits');
  }
  if (member.loans.length > 0) {
    throw new LoanError('Outstanding loan(s) must be cleared before a new application');
  }
  const kins = await db.nextOfKin.count({ where: { memberProfileId } });
  if (kins < 1) throw new LoanError('At least one next of kin must be registered');
  return { product, savingsTotal, openLoans: member.loans.length };
}

// ---------------------------------------------------------------- state machine
const ALLOWED: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['GUARANTOR_PENDING', 'VETTING', 'REJECTED', 'CANCELLED'],
  GUARANTOR_PENDING: ['VETTING', 'REJECTED', 'CANCELLED'],
  VETTING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['DISBURSED', 'CANCELLED'],
  REJECTED: [], DISBURSED: [], CANCELLED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

/** Guarantor eligibility — guide §10.2.3. */
export async function checkGuarantorEligibility(guarantorMemberId: string, requestedGuaranteeCents: number, applicantMemberId: string) {
  const limits = await getSettings('limits');
  const g = await db.memberProfile.findUnique({
    where: { id: guarantorMemberId },
    include: { savingsAccounts: true, sharePosition: true },
  });
  if (!g) throw new LoanError('Guarantor member not found');
  if (g.id === applicantMemberId) throw new LoanError('Cannot guarantee own loan');
  if (g.status !== 'ACTIVE') throw new LoanError(`Guarantor status is ${g.status}`);
  if (!g.kycVerified) throw new LoanError('Guarantor KYC not verified');

  const open = await db.guarantor.count({
    where: { guarantorMemberId: g.id, status: { in: ['PENDING', 'ACCEPTED'] }, application: { status: { in: ['SUBMITTED', 'GUARANTOR_PENDING', 'VETTING', 'APPROVED'] } } },
  });
  if (open >= limits.maxOpenGuarantees) throw new LoanError(`Guarantor already has ${open} open guarantees (max ${limits.maxOpenGuarantees})`);

  const savingsTotal = g.savingsAccounts.reduce((s, a) => s + Math.max(0, a.balanceCents - a.heldFundsCents), 0);
  const exposureCap = Math.round((savingsTotal * limits.guaranteeExposureCapPct) / 100);
  if (requestedGuaranteeCents > exposureCap) {
    throw new LoanError(`Guarantee exceeds exposure cap (${limits.guaranteeExposureCapPct}% of available savings = cap)`);
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------- disbursement
export async function disburseLoan(opts: {
  applicationId: string; channel: 'COUNTER' | 'MPESA' | 'BANK' | 'PESAPAL';
  channelRef?: string; performedById: string;
}) {
  const gl = await getSettings('glMap');
  return db.$transaction(async (tx) => {
    const app = await tx.loanApplication.findUnique({
      where: { id: opts.applicationId },
      include: { memberProfile: true, product: true, guarantors: true },
    });
    if (!app) throw new LoanError('Application not found');
    if (app.status !== 'APPROVED') throw new LoanError('Only APPROVED applications can be disbursed');

    const principal = app.approvedAmountCents ?? app.requestedAmountCents;
    const processingFee = Math.round((principal * app.product.processingFeeBps) / 10_000);
    const insuranceFee = Math.round((principal * app.product.insuranceFeeBps) / 10_000);
    const fees = processingFee + insuranceFee;
    const net = principal - fees;

    const loanNumber = await nextSequence(tx, 'loan');
    const disbursedAt = new Date();
    const schedule = buildSchedule(principal, app.product.interestRateBps, app.termMonths, app.product.interestMethod as 'REDUCING' | 'FLAT', disbursedAt, app.product.gracePeriodDays);

    const loan = await tx.loan.create({
      data: {
        loanNumber,
        applicationId: app.id,
        memberProfileId: app.memberProfileId,
        productId: app.productId,
        principalCents: principal,
        feesChargedCents: fees,
        netDisbursedCents: net,
        interestMethod: app.product.interestMethod,
        interestRateBps: app.product.interestRateBps,
        termMonths: app.termMonths,
        outstandingCents: principal,
        status: 'ACTIVE',
        disbursedAt,
        disbursementChannel: opts.channel,
        disbursementRef: opts.channelRef ?? null,
        firstDueAt: schedule[0].dueDate,
        nextDueAt: schedule[0].dueDate,
        disbursedById: opts.performedById,
      },
    });
    await tx.repaymentSchedule.createMany({
      data: schedule.map((s) => ({
        loanId: loan.id, installmentNo: s.installmentNo, dueDate: s.dueDate,
        principalDueCents: s.principalDueCents, interestDueCents: s.interestDueCents,
        totalDueCents: s.totalDueCents,
      })),
    });

    // GL: DR loans asset · CR fee incomes · CR settlement (net)
    const settleCode = opts.channel === 'COUNTER' ? gl.cashTeller : opts.channel === 'MPESA' ? gl.mpesaSettlement : gl.bankOperations;
    const journalId = await postJournal(tx, {
      memo: `Loan disbursement ${loanNumber} (${app.memberProfile.memberNumber})`,
      source: 'LOANS', sourceRef: loanNumber, postedById: opts.performedById,
      lines: [
        { accountCode: gl.loansPortfolio, debit: principal },
        ...(processingFee ? [{ accountCode: gl.feeIncome, credit: processingFee, narration: 'Processing fee' }] : []),
        ...(insuranceFee ? [{ accountCode: gl.insuranceFeeIncome, credit: insuranceFee, narration: 'Insurance fee' }] : []),
        { accountCode: settleCode, credit: net, narration: `Net disbursed via ${opts.channel}` },
      ],
    });

    // freeze guarantor holds on their main accounts (guide §10.2.3)
    for (const g of app.guarantors) {
      if (g.status === 'ACCEPTED' || g.status === 'MANUAL_RECORDED') {
        const main = await tx.savingsAccount.findFirst({
          where: { memberProfileId: g.guarantorMemberId }, orderBy: { openedAt: 'asc' },
        });
        if (main) {
          await tx.savingsAccount.update({
            where: { id: main.id },
            data: { heldFundsCents: { increment: g.guaranteedAmountCents } },
          });
        }
      }
    }

    await tx.loanApplication.update({
      where: { id: app.id },
      data: { status: 'DISBURSED', decidedAt: new Date(), decidedById: opts.performedById },
    });

    return { loanId: loan.id, loanNumber, net, fees, journalId, schedule };
  });
}

// ---------------------------------------------------------------- repayment allocation
export interface AllocationResult { penalties: number; interest: number; principal: number; excess: number; breakdown: { installmentNo: number; penalty: number; interest: number; principal: number }[] }

/** Waterfall: penalties → interest → principal (oldest first) — guide §10.2.8. */
export function allocateRepayment(scheduleRows: { installmentNo: number; penaltyDueCents: number; interestDueCents: number; principalDueCents: number; totalDueCents: number; paidCents: number }[], amountCents: number): AllocationResult {
  const breakdown: AllocationResult['breakdown'] = [];
  let penalties = 0, interest = 0, principal = 0;
  let remaining = amountCents;
  for (const row of scheduleRows) {
    if (remaining <= 0) break;
    const owedPenalty = Math.max(0, row.penaltyDueCents);
    const owedInterest = Math.max(0, row.interestDueCents);
    const owedPrincipal = Math.max(0, row.principalDueCents);
    const already = row.paidCents;
    const duePenalty = Math.max(0, owedPenalty - already); // simplified: paid reduces oldest
    const dueInterest = Math.max(0, owedInterest);
    const duePrincipal = Math.max(0, owedPrincipal);
    const takePenalty = Math.min(remaining, duePenalty); remaining -= takePenalty; penalties += takePenalty;
    const takeInterest = Math.min(remaining, dueInterest); remaining -= takeInterest; interest += takeInterest;
    const takePrincipal = Math.min(remaining, duePrincipal); remaining -= takePrincipal; principal += takePrincipal;
    if (takePenalty + takeInterest + takePrincipal > 0) {
      breakdown.push({ installmentNo: row.installmentNo, penalty: takePenalty, interest: takeInterest, principal: takePrincipal });
    }
  }
  const excess = Math.max(0, remaining);
  return { penalties, interest, principal, excess, breakdown };
}

/** Post a loan repayment through the waterfall. */
export async function postLoanRepayment(opts: {
  loanId: string; amountCents: number; channel: 'PORTAL' | 'MPESA' | 'COUNTER' | 'PAYROLL' | 'PESAPAL';
  externalRef?: string; paymentTransactionId?: string; savingsTransactionId?: string;
  receivedById?: string | null; narration?: string;
}) {
  const gl = await getSettings('glMap');
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: opts.loanId },
      include: { memberProfile: true, schedule: { orderBy: { installmentNo: 'asc' } } },
    });
    if (!loan) throw new LoanError('Loan not found');
    if (loan.status === 'CLOSED' || loan.status === 'WRITTEN_OFF') throw new LoanError('Loan is not active');

    const outstandingRows = loan.schedule.filter((s) => s.status !== 'WAIVED' && s.paidCents < s.totalDueCents);
    if (outstandingRows.length === 0) throw new LoanError('No outstanding installments');
    const alloc = allocateRepayment(outstandingRows, opts.amountCents);

    // update schedule rows
    for (const b of alloc.breakdown) {
      const row = loan.schedule.find((s) => s.installmentNo === b.installmentNo)!;
      const paid = row.paidCents + b.penalty + b.interest + b.principal;
      await tx.repaymentSchedule.update({
        where: { id: row.id },
        data: { paidCents: paid, status: paid >= row.totalDueCents ? 'PAID' : 'PARTIAL', paidAt: paid >= row.totalDueCents ? new Date() : null },
      });
    }

    const principalPart = alloc.principal;
    const newOutstanding = loan.outstandingCents - principalPart;
    const reference = `PAY-${seqNo('')}`;
    const repayment = await tx.loanRepayment.create({
      data: {
        reference,
        loanId: loan.id,
        amountCents: opts.amountCents,
        channel: opts.channel,
        allocation: alloc as any,
        externalRef: opts.externalRef ?? null,
        savingsTransactionId: opts.savingsTransactionId ?? null,
        paymentTransactionId: opts.paymentTransactionId ?? null,
        receivedById: opts.receivedById ?? null,
        journalEntryId: null,
      },
    });

    // GL: DR settlement/liability · CR loans(principal) + interest income + penalty income
    const debitCode = opts.channel === 'MPESA' ? gl.mpesaSettlement
      : opts.channel === 'COUNTER' ? gl.cashTeller
      : opts.channel === 'PAYROLL' ? gl.memberSavings
      : gl.memberSavings; // PORTAL pays from savings liability
    const journalId = await postJournal(tx, {
      memo: `Loan repayment ${loan.loanNumber} (${loan.memberProfile.memberNumber}) ref ${reference}`,
      source: 'LOANS', sourceRef: reference, postedById: opts.receivedById ?? null,
      lines: [
        { accountCode: debitCode, debit: opts.amountCents - alloc.excess },
        { accountCode: gl.loansPortfolio, credit: principalPart, narration: 'Principal' },
        { accountCode: gl.loanInterestIncome, credit: alloc.interest, narration: 'Interest' },
        { accountCode: gl.penaltyIncome, credit: alloc.penalties, narration: 'Penalty' },
      ],
    });
    await tx.loanRepayment.update({ where: { id: repayment.id }, data: { journalEntryId: journalId } });

    const allDone = await tx.repaymentSchedule.count({ where: { loanId: loan.id, status: { in: ['PENDING', 'PARTIAL'] } } });
    const closed = allDone === 0;
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        outstandingCents: newOutstanding,
        status: closed ? 'CLOSED' : loan.status,
        closedAt: closed ? new Date() : null,
        nextDueAt: loan.schedule.find((s) => s.paidCents < s.totalDueCents && s.status !== 'WAIVED')?.dueDate ?? null,
      },
    });
    if (closed) await releaseGuarantorHolds(tx, loan.id);

    return { repaymentId: repayment.id, reference, allocation: alloc, closed, newOutstanding };
  });
}

async function releaseGuarantorHolds(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], loanId: string) {
  const app = await tx.loan.findUnique({ where: { id: loanId }, include: { application: { include: { guarantors: true } } } });
  if (!app?.application) return;
  for (const g of app.application.guarantors) {
    if (g.status === 'ACCEPTED' || g.status === 'MANUAL_RECORDED') {
      const main = await tx.savingsAccount.findFirst({ where: { memberProfileId: g.guarantorMemberId }, orderBy: { openedAt: 'asc' } });
      if (main && main.heldFundsCents > 0) {
        await tx.savingsAccount.update({
          where: { id: main.id },
          data: { heldFundsCents: { decrement: Math.min(main.heldFundsCents, g.guaranteedAmountCents) } },
        });
      }
    }
  }
}

// ---------------------------------------------------------------- daily job logic
/** Accrue penalties + aging — idempotent per date. Guide §10.2.9. */
export async function dailyLoanJob() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const loans = await db.loan.findMany({ where: { status: { in: ['ACTIVE', 'OVERDUE'] } }, include: { schedule: true } });
  let penalized = 0;
  for (const loan of loans) {
    const overdue = loan.schedule.filter((s) => s.dueDate < today && s.paidCents < s.totalDueCents && s.status !== 'WAIVED');
    const newStatus = overdue.length === 0 ? 'ACTIVE' : (overdue.some((o) => (today.getTime() - o.dueDate.getTime()) / 86400000 > 30) ? 'DEFAULTED' : 'OVERDUE');
    let penaltyAdded = 0;
    if (overdue.length && loan.interestRateBps >= 0) {
      const product = await db.loanProduct.findUnique({ where: { id: loan.productId } });
      const penaltyBps = product?.penaltyPerDayBps ?? 50;
      const through = loan.penaltyComputedThrough ?? new Date(0);
      const daysSince = Math.floor((today.getTime() - new Date(through).getTime()) / 86400000);
      if (daysSince > 0) {
        const outstandingOverdue = overdue.reduce((s, o) => s + (o.totalDueCents - o.paidCents), 0);
        penaltyAdded = Math.round((outstandingOverdue * penaltyBps * daysSince) / 1_000_000);
        for (const o of overdue) {
          const share = Math.round(((o.totalDueCents - o.paidCents) * penaltyBps * daysSince) / 1_000_000);
          await db.repaymentSchedule.update({
            where: { id: o.id },
            data: {
              penaltyDueCents: { increment: share },
              totalDueCents: { increment: share },
            },
          });
        }
      }
    }
    await db.loan.update({
      where: { id: loan.id },
      data: {
        status: newStatus,
        penaltyAccruedCents: { increment: penaltyAdded },
        penaltyComputedThrough: today,
      },
    });
    penalized += penaltyAdded;
  }
  return { processed: loans.length, penalized };
}
