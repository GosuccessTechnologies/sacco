// Role dashboard — per-role KPIs and work queues for the dashboard hub (Instr 7).
// All queries are session-scoped server-side; the API layer decides what to return.
import { db } from '@/lib/db';

export type StaffDesk = 'MANAGER' | 'TELLER' | 'LOAN_OFFICER' | 'ACCOUNTANT' | 'COMPLIANCE' | 'RECEPTION' | 'OTHER';

const DAY = 86_400_000;

export interface ManagerDash {
  pendingApplications: number; pendingLoanApps: number; pendingExpenses: number;
  pendingRecons: number; guarantorPending: number; leavePending: number;
  portfolioOutstandingCents: number; parCents: number; parRatio: number;
  cashTellerCents: number; bankCents: number; savingsCents: number; activeMembers: number;
  disbursedThisMonthCents: number; collectedThisMonthCents: number;
}

export async function managerDashboard(): Promise<ManagerDash> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [
    pendingApplications, pendingLoanApps, pendingExpenses, pendingRecons, guarantorPending, leavePending,
    loans, glAssets, activeMembers, disbursed, collected,
  ] = await Promise.all([
    db.membershipApplication.count({ where: { status: 'PENDING' } }),
    db.loanApplication.count({ where: { status: 'SUBMITTED' } }),
    db.expense.count({ where: { status: 'APPROVED' } }), // awaiting payment
    db.bankReconciliation.count({ where: { status: 'DRAFT' } }),
    db.guarantor.count({ where: { status: 'PENDING' } }),
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.loan.findMany({ where: { status: { in: ['ACTIVE', 'IN_ARREARS'] } }, select: { outstandingCents: true, schedule: { select: { status: true, dueDate: true, totalDueCents: true, paidCents: true } } } }),
    db.glAccount.findMany({ where: { code: { in: ['1000', '1010', '1021'] } }, select: { code: true, cachedBalanceCents: true } }),
    db.memberProfile.count({ where: { status: 'ACTIVE' } }),
    db.loanRepayment.aggregate({ _sum: { amountCents: true }, where: { createdAt: { gte: monthStart } } }),
    db.loanRepayment.aggregate({ _sum: { amountCents: true }, where: { valueDate: { gte: monthStart } } }),
  ]);
  let parCents = 0;
  for (const l of loans) {
    for (const s of l.schedule) {
      if (s.status === 'WAIVED' || s.paidCents >= s.totalDueCents || s.dueDate >= today) continue;
      const days = Math.floor((today.getTime() - s.dueDate.getTime())) / DAY;
      if (days > 30) parCents += s.totalDueCents - s.paidCents;
    }
  }
  const outstanding = loans.reduce((s, l) => s + l.outstandingCents, 0);
  const cash = glAssets.find((a) => a.code === '1000')?.cachedBalanceCents ?? 0;
  const bank = glAssets.find((a) => a.code === '1021')?.cachedBalanceCents ?? 0;
  const savingsAgg = await db.savingsAccount.aggregate({ _sum: { balanceCents: true }, where: { status: { in: ['OPEN', 'DORMANT'] } } });
  return {
    pendingApplications, pendingLoanApps, pendingExpenses, pendingRecons, guarantorPending, leavePending,
    portfolioOutstandingCents: outstanding, parCents, parRatio: outstanding ? parCents / outstanding : 0,
    cashTellerCents: cash, bankCents: bank, savingsCents: savingsAgg._sum.balanceCents ?? 0, activeMembers,
    disbursedThisMonthCents: disbursed._sum.amountCents ?? 0, collectedThisMonthCents: collected._sum.amountCents ?? 0,
  };
}

export interface TellerDash {
  openSessions: { id: string; userName: string; openedAt: string; floatCents: number }[];
  mySession: { id: string; openedAt: string; floatCents: number; cashCount: number } | null;
  todayTransactions: number; todayVolumeCents: number; pendingCheques: number;
  recent: { id: string; type: string; amountCents: number; createdAt: string; accountNumber: string | null }[];
}

export async function tellerDashboard(userId: string): Promise<TellerDash> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [sessions, agg, pendingCheques, recent] = await Promise.all([
    db.tellerSession.findMany({ where: { status: 'OPEN' }, include: { user: { select: { name: true } } }, orderBy: { openedAt: 'desc' }, take: 6 }),
    db.tellerTransaction.aggregate({ _sum: { amountCents: true }, _count: true, where: { createdAt: { gte: todayStart } } }),
    db.tellerTransaction.count({ where: { type: 'CHEQUE_DEPOSIT', status: 'PENDING_CLEARING' } }),
    db.tellerTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { account: { select: { accountNumber: true } } } }),
  ]);
  const mine = sessions.find((s) => s.userId === userId) ?? null;
  const myCount = mine
    ? await db.tellerTransaction.count({ where: { sessionId: mine.id, createdAt: { gte: todayStart } } })
    : 0;
  return {
    openSessions: sessions.map((s) => ({ id: s.id, userName: s.user.name, openedAt: s.openedAt.toISOString(), floatCents: s.openingFloatCents })),
    mySession: mine ? { id: mine.id, openedAt: mine.openedAt.toISOString(), floatCents: mine.openingFloatCents, cashCount: myCount } : null,
    todayTransactions: agg._count, todayVolumeCents: agg._sum.amountCents ?? 0, pendingCheques,
    recent: recent.map((t) => ({ id: t.id, type: t.type, amountCents: t.amountCents, createdAt: t.createdAt.toISOString(), accountNumber: t.account?.accountNumber ?? null })),
  };
}

export interface LoansDash {
  queue: { id: string; ref: string; memberName: string; productName: string; amountCents: number; createdAt: string }[];
  activeLoans: number; inArrears: number; outstandingCents: number; disbursedThisMonthCents: number;
  arrearsBuckets: Record<string, number>; parRatio: number; dueThisWeekCents: number;
}

export async function loansDashboard(): Promise<LoansDash> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekEnd = new Date(today.getTime() + 7 * DAY);
  const [queue, actives, inArrearsAgg, outstandingAgg, disbursed, loans, dueSoon] = await Promise.all([
    db.loanApplication.findMany({
      where: { status: 'SUBMITTED' }, orderBy: { appliedAt: 'asc' }, take: 8,
      include: { memberProfile: { select: { firstName: true, lastName: true } }, product: { select: { name: true } } },
    }),
    db.loan.count({ where: { status: 'ACTIVE' } }),
    db.loan.count({ where: { status: 'IN_ARREARS' } }),
    db.loan.aggregate({ _sum: { outstandingCents: true }, where: { status: { in: ['ACTIVE', 'IN_ARREARS'] } } }),
    db.loan.aggregate({ _sum: { principalCents: true }, where: { disbursedAt: { gte: monthStart } } }),
    db.loan.findMany({ where: { status: { in: ['ACTIVE', 'IN_ARREARS'] } }, select: { outstandingCents: true, schedule: { select: { status: true, dueDate: true, totalDueCents: true, paidCents: true } } } }),
    db.repaymentSchedule.aggregate({ _sum: { totalDueCents: true }, where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: today, lte: weekEnd } } }),
  ]);
  const buckets: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
  let parCents = 0;
  for (const l of loans) {
    for (const s of l.schedule) {
      if (s.status === 'WAIVED' || s.paidCents >= s.totalDueCents || s.dueDate >= today) continue;
      const days = Math.floor((today.getTime() - s.dueDate.getTime()) / DAY);
      const owed = s.totalDueCents - s.paidCents;
      if (days <= 30) buckets['0-30'] += owed;
      else if (days <= 60) buckets['31-60'] += owed;
      else if (days <= 90) buckets['61-90'] += owed;
      else if (days <= 180) buckets['91-180'] += owed;
      else buckets['180+'] += owed;
      if (days > 30) parCents += owed;
    }
  }
  const outstanding = outstandingAgg._sum.outstandingCents ?? 0;
  return {
    queue: queue.map((a) => ({
      id: a.id, ref: a.applicationNumber ?? a.id.slice(-8),
      memberName: `${a.memberProfile.firstName} ${a.memberProfile.lastName}`,
      productName: a.product.name, amountCents: a.requestedAmountCents, createdAt: a.appliedAt.toISOString(),
    })),
    activeLoans: actives, inArrears: inArrearsAgg, outstandingCents: outstanding,
    disbursedThisMonthCents: disbursed._sum.principalCents ?? 0,
    arrearsBuckets: buckets, parRatio: outstanding ? parCents / outstanding : 0,
    dueThisWeekCents: dueSoon._sum.totalDueCents ?? 0,
  };
}

export interface AccountsDash {
  trialCheckCents: number; unallocatedCents: number; suspenseCount: number;
  draftRecons: { id: string; bankName: string; differenceCents: number; periodTo: string }[];
  unpaidExpenses: { id: string; description: string; amountCents: number; status: string }[];
  totalsByType: Record<string, number>; journalsThisMonth: number;
}

export async function accountsDashboard(): Promise<AccountsDash> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [postable, unallocated, suspense, recons, expenses, journals] = await Promise.all([
    db.glAccount.findMany({ where: { isPostable: true }, select: { type: true, cachedBalanceCents: true } }),
    db.glAccount.findUnique({ where: { code: '2050' }, select: { cachedBalanceCents: true } }),
    db.paymentTransaction.count({ where: { status: 'PENDING', type: { not: 'STK_PUSH' } } }),
    db.bankReconciliation.findMany({ where: { status: 'DRAFT' }, include: { bankAccount: { select: { name: true, bankName: true } } }, take: 6 }),
    db.expense.findMany({ where: { status: { in: ['DRAFT', 'APPROVED'] } }, orderBy: { createdAt: 'desc' }, take: 6 }),
    db.journalEntry.count({ where: { createdAt: { gte: monthStart } } }),
  ]);
  const totals: Record<string, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0, INCOME: 0, EXPENSE: 0 };
  for (const a of postable) totals[a.type] += a.cachedBalanceCents;
  return {
    trialCheckCents: totals.ASSET - totals.LIABILITY - totals.EQUITY - totals.INCOME + totals.EXPENSE,
    unallocatedCents: unallocated?.cachedBalanceCents ?? 0, suspenseCount: suspense,
    draftRecons: recons.map((r) => ({ id: r.id, bankName: r.bankAccount.bankName ?? r.bankAccount.name, differenceCents: r.differenceCents, periodTo: r.periodTo.toISOString() })),
    unpaidExpenses: expenses.map((e) => ({ id: e.id, description: e.description, amountCents: e.amountCents, status: e.status })),
    totalsByType: totals, journalsThisMonth: journals,
  };
}

export interface ComplianceDash {
  kycPending: number; dormantAccounts: number; suspendedMembers: number;
  recentCriticalAudit: { id: string; action: string; module: string; createdAt: string; userName: string | null }[];
  dormantList: { id: string; accountNumber: string; lastActivityAt: string | null }[];
  activeLoansCount: number; overdueSchedules: number;
}

export async function complianceDashboard(): Promise<ComplianceDash> {
  const [kycPending, dormant, suspended, audit, dormantList, loansCount, overdue] = await Promise.all([
    db.memberProfile.count({ where: { kycVerified: false, deletedAt: null, status: { not: 'EXITED' } } }),
    db.savingsAccount.count({ where: { status: 'DORMANT' } }),
    db.memberProfile.count({ where: { status: 'SUSPENDED' } }),
    db.auditLog.findMany({ where: { severity: 'critical' }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } }),
    db.savingsAccount.findMany({ where: { status: 'DORMANT' }, take: 6, orderBy: { lastActivityAt: 'asc' } }),
    db.loan.count({ where: { status: { in: ['ACTIVE', 'IN_ARREARS'] } } }),
    db.repaymentSchedule.count({ where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: new Date() } } }),
  ]);
  return {
    kycPending, dormantAccounts: dormant, suspendedMembers: suspended,
    recentCriticalAudit: audit.map((a) => ({ id: a.id, action: a.action, module: a.module, createdAt: a.createdAt.toISOString(), userName: a.user?.name ?? null })),
    dormantList: dormantList.map((a) => ({ id: a.id, accountNumber: a.accountNumber, lastActivityAt: a.lastActivityAt?.toISOString() ?? null })),
    activeLoansCount: loansCount, overdueSchedules: overdue,
  };
}

export interface ReceptionDash {
  newApplications: { id: string; ref: string; name: string; createdAt: string; status: string }[];
  pendingCount: number; approvedThisWeek: number; membersTotal: number;
  subscribers: number; recentMembers: { id: string; name: string; memberNumber: string; joinedAt: string }[];
}

export async function receptionDashboard(): Promise<ReceptionDash> {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const [apps, pendingCount, approvedWeek, membersTotal, subscribers, recentMembers] = await Promise.all([
    db.membershipApplication.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    db.membershipApplication.count({ where: { status: 'PENDING' } }),
    db.membershipApplication.count({ where: { status: 'APPROVED', updatedAt: { gte: weekAgo } } }),
    db.memberProfile.count(),
    db.subscriber.count(),
    db.memberProfile.findMany({ orderBy: { joinedAt: 'desc' }, take: 6, select: { id: true, firstName: true, lastName: true, memberNumber: true, joinedAt: true } }),
  ]);
  return {
    newApplications: apps.map((a) => ({ id: a.id, ref: a.applicationNumber, name: `${a.firstName} ${a.lastName}`, createdAt: a.createdAt.toISOString(), status: a.status })),
    pendingCount, approvedThisWeek: approvedWeek, membersTotal, subscribers,
    recentMembers: recentMembers.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, memberNumber: m.memberNumber, joinedAt: m.joinedAt.toISOString() })),
  };
}
