// Cron jobs registry — CRON_SECRET guarded (guide §19.2).
import { db } from '@/lib/db';
import { dailyLoanJob } from '@/lib/loans/service';

const JOBS = {
  'loan-daily': async () => {
    const result = await dailyLoanJob();
    return { processed: result.processed, penalizedCents: result.penalized };
  },
  'savings-interest': async () => {
    // monthly interest posting (guide §9.2.5)
    const products = await db.savingsProduct.findMany({ where: { active: true } });
    const { postSavingsTransaction } = await import('@/lib/savings/service');
    let posted = 0, totalInterest = 0;
    for (const p of products.filter((x) => x.interestRateBps > 0)) {
      const accounts = await db.savingsAccount.findMany({ where: { productId: p.id, status: 'OPEN' } });
      for (const a of accounts) {
        if (a.balanceCents <= 0) continue;
        // FIXED products accrue to maturity instead
        if (p.type === 'FIXED' && a.maturityDate && a.maturityDate > new Date()) continue;
        const interest = Math.floor((a.balanceCents * (p.interestRateBps / 100)) / 12);
        if (interest <= 0) continue;
        try {
          await postSavingsTransaction({
            accountId: a.id, type: 'INTEREST', channel: 'INTEREST_POSTING', amountCents: interest,
            narration: `Monthly interest (${p.interestRateBps / 100}%)`, performedById: null,
          });
          posted++; totalInterest += interest;
        } catch { /* policy guard */ }
      }
    }
    return { accounts: posted, totalInterestCents: totalInterest };
  },
  'standing-orders': async () => {
    const { postSavingsTransaction } = await import('@/lib/savings/service');
    const due = await db.standingOrder.findMany({ where: { active: true, nextRunAt: { lte: new Date() } } });
    const limits = await import('@/lib/settings').then((m) => m.getSettings('limits'));
    let executed = 0, failed = 0;
    for (const o of due) {
      try {
        if (o.destinationType === 'INTERNAL' && o.toAccountId) {
          await postSavingsTransaction({ accountId: o.fromAccountId, type: 'TRANSFER_OUT', channel: 'STANDING_ORDER', amountCents: o.amountCents, narration: `Standing order to ${o.toAccountId.slice(0, 8)}`, performedById: null });
          await postSavingsTransaction({ accountId: o.toAccountId, type: 'TRANSFER_IN', channel: 'STANDING_ORDER', amountCents: o.amountCents, narration: 'Standing order receipt', performedById: null });
          executed++;
          await db.standingOrder.update({ where: { id: o.id }, data: { consecutiveFailures: 0 } });
        } else {
          // external bank instruction — record for accountant (guide §9.2.4)
          await db.standingOrder.update({ where: { id: o.id }, data: { bankInstruction: o.bankInstruction ?? 'Pending bank transfer' } });
          executed++;
        }
      } catch {
        failed++;
        const failures = o.consecutiveFailures + 1;
        await db.standingOrder.update({
          where: { id: o.id },
          data: { consecutiveFailures: failures, active: failures < limits.standingOrderMaxFailures },
        });
      }
      const next = new Date(o.nextRunAt);
      next.setMonth(next.getMonth() + 1);
      await db.standingOrder.update({ where: { id: o.id }, data: { nextRunAt: next } });
    }
    return { due: due.length, executed, failed };
  },
  'kpi-snapshot': async () => {
    const { overviewStats } = await import('@/lib/analytics');
    const stats = await overviewStats();
    await db.kpiSnapshot.create({
      data: { metricKey: 'overview', asOf: new Date(), valueJson: stats as any },
    }).catch(() => null);
    return { snapshot: 'overview' };
  },
  'payment-sweeper': async () => {
    // mark timed-out pending STK pushes
    const cutoff = new Date(Date.now() - 5 * 60000);
    const stale = await db.paymentTransaction.updateMany({
      where: { status: 'PENDING', type: 'STK_PUSH', createdAt: { lt: cutoff } },
      data: { status: 'TIMEOUT' },
    });
    return { timedOut: stale.count };
  },
  'cheque-clearing': async () => {
    const limits = await import('@/lib/settings').then((m) => m.getSettings('limits'));
    const { postSavingsTransaction } = await import('@/lib/savings/service');
    const cutoff = new Date(Date.now() - limits.chequeClearingDays * 86400000);
    const pending = await db.tellerTransaction.findMany({ where: { type: 'CHEQUE_DEPOSIT', status: 'PENDING_CLEARING', createdAt: { lte: cutoff } } });
    let cleared = 0;
    for (const t of pending) {
      if (!t.accountId) continue;
      try {
        await postSavingsTransaction({
          accountId: t.accountId, type: 'DEPOSIT', channel: 'BANK', amountCents: t.amountCents,
          narration: `Cheque cleared (${t.chequeBank} #${t.chequeNo})`, performedById: null,
        });
        await db.tellerTransaction.update({ where: { id: t.id }, data: { status: 'CLEARED' } });
        cleared++;
      } catch { /* keep pending */ }
    }
    return { cleared, pending: pending.length };
  },
  'dormancy': async () => {
    const cutoff = new Date(Date.now() - 365 * 86400000);
    const res = await db.savingsAccount.updateMany({
      where: { status: 'OPEN', lastActivityAt: { lt: cutoff }, balanceCents: { gt: 0 } },
      data: { status: 'DORMANT' },
    });
    return { dormant: res.count };
  },
  // Instr 8 — loan repayment reminders (email + SMS) before the due date.
  // Sends at 7 days and 3 days before each unpaid installment's due date
  // (and on the due date itself), deduplicated per installment + bucket.
  'repayment-reminders': async () => {
    const { notifyPerson } = await import('@/lib/notify');
    const { fmtMoney } = await import('@/lib/money');
    const DAY = 86_400_000;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = [7, 3, 0]; // days before due date
    let sent = 0, skipped = 0;

    for (const daysBefore of buckets) {
      const dueFrom = new Date(today.getTime() + daysBefore * DAY);
      const dueTo = new Date(dueFrom.getTime() + DAY - 1);
      const rows = await db.repaymentSchedule.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { gte: dueFrom, lte: dueTo },
        },
        include: {
          loan: {
            select: {
              id: true, loanNumber: true, outstandingCents: true,
              memberProfile: { select: { id: true, userId: true, firstName: true, email: true, phone: true } },
            },
          },
        },
      });
      for (const row of rows) {
        const member = row.loan.memberProfile;
        if (!member.email && !member.phone) { skipped++; continue; }
        // dedupe marker: one reminder per loan installment + bucket (link-scoped)
        const marker = `loan-reminder:${row.loan.id}:${row.installmentNo}:${daysBefore}`;
        const existing = await db.notification.findFirst({
          where: { link: marker },
          select: { id: true },
        }).catch(() => null);
        if (existing) { skipped++; continue; }

        const balanceDue = row.totalDueCents - row.paidCents;
        const dueDateStr = row.dueDate.toISOString().slice(0, 10);
        await notifyPerson(
          { name: member.firstName, email: member.email, phone: member.phone },
          'repayment_due',
          {
            name: member.firstName,
            amount: fmtMoney(balanceDue),
            loanNumber: row.loan.loanNumber,
            dueDate: dueDateStr,
          },
          { ctaLabel: 'Repay from your portal', ctaHref: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/loans` },
        ).catch(() => null);

        // in-app copy doubles as the dedupe marker (members without a portal
        // account are deduped through any portal holder's marker row — the link
        // itself is globally unique per installment+bucket)
        const markerUserId = member.userId
          ?? (await db.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } }))!.id;
        await db.notification.create({
          data: {
            userId: markerUserId,
            title: member.userId
              ? (daysBefore === 0 ? 'Installment due today' : `Installment due in ${daysBefore} day${daysBefore > 1 ? 's' : ''}`)
              : `[reminder sent] loan ${row.loan.loanNumber} #${row.installmentNo}`,
            body: member.userId
              ? `Loan ${row.loan.loanNumber} installment ${row.installmentNo} of KES ${fmtMoney(balanceDue)} is due on ${dueDateStr}. Pay via M-Pesa or your portal.`
              : marker,
            type: 'LOAN',
            link: marker,
          },
        }).catch(() => null);
        sent++;
      }
    }
    return { sent, skipped, buckets };
  },
} as const;

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || authHeader !== `Bearer ${secret}`) {
    // also allow ?secret= for vercel cron convenience
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const handler = (JOBS as Record<string, (() => Promise<unknown>) | undefined>)[job];
  if (!handler) return Response.json({ error: 'Unknown job' }, { status: 404 });
  try {
    const result = await handler();
    return Response.json({ job, ok: true, result, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ job, ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const POST = GET;
