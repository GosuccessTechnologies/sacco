'use client';
// ============================================================================
// Admin dashboard hub — role-aware consoles (Instr 7).
// SUPER_ADMIN/ADMIN → institution KPIs + charts + alerts
// MANAGER → approvals queue, portfolio health, cash position
// TELLER → till session, today's transactions
// LOAN_OFFICER → application queue, arrears/PAR, pipeline
// ACCOUNTANT → trial balance, suspense, reconciliations
// COMPLIANCE → KYC, dormancy, audit highlights
// RECEPTION → applications intake, member lookup
// ============================================================================
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Users, PiggyBank, Landmark, TrendingUp, Wallet, AlertTriangle, Smartphone, ArrowRight,
  ClipboardCheck, Scale, Store, ShieldCheck, UserRound, Bell, CheckCircle2, Clock3,
  Banknote, FileWarning, ScrollText, UserPlus, PhoneCall, Activity,
} from 'lucide-react';
import { StatCard, PageHeader } from '@/components/kit/kit-bits';
import { fmtMoneyPlain, fmtDate, fmtDateTime } from '@/lib/client-utils';
import { usePermission, useCurrentUser } from '@/hooks/use-permission';

const FALLBACK_COLORS: Record<string, string> = {
  '--t-primary': '#0E7C5A', '--t-border': '#DCE5DF', '--t-muted-text': '#5C6B63',
  '--t-info': '#2C7A7B', '--t-warning': '#B7791F', '--t-success': '#1E8E5A',
  '--t-accent': '#F2B33C', '--t-danger': '#C0392B',
};

/** Client-safe theme color reader (fixes the SSR getComputedStyle crash). */
function useThemeColors() {
  const [colors, setColors] = React.useState<Record<string, string>>(FALLBACK_COLORS);
  React.useEffect(() => {
    try {
      const css = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const k of Object.keys(FALLBACK_COLORS)) {
        const v = css.getPropertyValue(k).trim();
        next[k] = v || FALLBACK_COLORS[k];
      }
      setColors(next);
    } catch { /* keep fallbacks */ }
  }, []);
  return (v: string) => colors[v] ?? FALLBACK_COLORS[v] ?? '#0E7C5A';
}

const greet = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function AdminDashboardPage() {
  const user = useCurrentUser();
  const { can } = usePermission();
  const color = useThemeColors();

  const roleDash = useQuery({
    queryKey: ['role-dashboard'],
    queryFn: async () => (await fetch('/api/analytics?want=role')).json(),
  });

  const canAnalytics = can('analytics_view');
  const analytics = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => (await fetch('/api/analytics')).json(),
    enabled: Boolean(canAnalytics),
  });

  const desk = roleDash.data?.desk ?? 'ADMIN';
  const o = analytics.data?.overview;
  const money = (analytics.data?.money ?? []) as { month: string; deposits: number; withdrawals: number; disbursed: number; collected: number }[];
  const membership = (analytics.data?.membership ?? []) as { month: string; joined: number; exited: number }[];
  const mix = (analytics.data?.mix ?? []) as { name: string; balance: number }[];
  const loanBook = analytics.data?.loanBook?.byStatus ?? [];

  const deskLabel: Record<string, string> = {
    ADMIN: 'Institution overview', MANAGER: 'Manager console', TELLER: 'Teller console',
    LOAN_OFFICER: 'Loans console', ACCOUNTANT: 'Accounts console', COMPLIANCE: 'Compliance console',
    RECEPTION: 'Reception console',
  };

  return (
    <>
      {/* ---------------- welcome banner */}
      <div className="card-hero mb-5 flex flex-col gap-4 rounded-2xl px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>
            {greet()}, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="mt-1 text-sm opacity-90">
            {deskLabel[desk] ?? 'Console'} · {user?.designation ? user.designation.replace(/_/g, ' ') : user?.role === 'SUPER_ADMIN' ? 'Super administrator' : 'Staff'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/members" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold transition hover:bg-white/25">
            <Users className="h-3.5 w-3.5" /> Members
          </Link>
          <Link href="/admin/loans" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold transition hover:bg-white/25">
            <Landmark className="h-3.5 w-3.5" /> Loans
          </Link>
          <Link href="/admin/communications" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold transition hover:bg-white/25">
            <Bell className="h-3.5 w-3.5" /> Comms
          </Link>
        </div>
      </div>

      {/* ---------------- ADMIN / SUPER ADMIN: institution KPIs + charts */}
      {(desk === 'ADMIN') && (
        roleDash.isLoading || analytics.isLoading || !o ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[...Array(8)].map((_, i) => <div key={i} className="public-card h-28 animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={Users} label="Active members" value={o.activeMembers.toLocaleString()} sub="KYC-verified co-operators" tone="primary" />
              <StatCard icon={PiggyBank} label="Member savings" value={o.totalSavingsCents} sub="All savings products" tone="success" />
              <StatCard icon={Landmark} label="Loan book" value={o.loanBookCents} sub={`${o.successfulPayments} successful digital payments`} tone="info" />
              <StatCard icon={TrendingUp} label="Share capital" value={o.shareCapitalCents} sub={`${o.totalShares.toLocaleString()} shares`} tone="warning" />
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <ChartCard title="Savings growth (deposits vs withdrawals)">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={money}>
                    <defs>
                      <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color('--t-primary')} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={color('--t-primary')} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={color('--t-border')} />
                    <XAxis dataKey="month" stroke={color('--t-muted-text')} fontSize={11} />
                    <YAxis stroke={color('--t-muted-text')} fontSize={11} tickFormatter={(v) => `${Math.round(v / 100_000)}k`} />
                    <Tooltip formatter={(v: number) => 'KES ' + fmtMoneyPlain(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${color('--t-border')}` }} />
                    <Area type="monotone" dataKey="deposits" name="Deposits" stroke={color('--t-primary')} fill="url(#gDep)" strokeWidth={2} />
                    <Line type="monotone" dataKey="withdrawals" name="Withdrawals" stroke={color('--t-warning')} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Disbursed vs collected (monthly)">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={money}>
                    <CartesianGrid strokeDasharray="3 3" stroke={color('--t-border')} />
                    <XAxis dataKey="month" stroke={color('--t-muted-text')} fontSize={11} />
                    <YAxis stroke={color('--t-muted-text')} fontSize={11} tickFormatter={(v) => `${Math.round(v / 100_000)}k`} />
                    <Tooltip formatter={(v: number) => 'KES ' + fmtMoneyPlain(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${color('--t-border')}` }} />
                    <Legend />
                    <Bar dataKey="disbursed" name="Disbursed" fill={color('--t-info')} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Collected" fill={color('--t-success')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Membership growth">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={membership}>
                    <CartesianGrid strokeDasharray="3 3" stroke={color('--t-border')} />
                    <XAxis dataKey="month" stroke={color('--t-muted-text')} fontSize={11} />
                    <YAxis stroke={color('--t-muted-text')} fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${color('--t-border')}` }} />
                    <Legend />
                    <Line type="monotone" dataKey="joined" name="Joined" stroke={color('--t-primary')} strokeWidth={2.5} />
                    <Line type="monotone" dataKey="exited" name="Exited" stroke={color('--t-danger')} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Savings product mix">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={mix.map((m) => ({ name: m.name, value: Math.max(1, Math.round(m.balance / 100_000)) }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {[color('--t-primary'), color('--t-info'), color('--t-warning'), color('--t-success'), color('--t-accent'), color('--t-danger')].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              <AlertCard title="Loan book by status" icon={Landmark}>
                {loanBook.map((b: any) => (
                  <div key={b.status} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{b.status}</span>
                    <span className="tabular-nums">{b.count} · KES {fmtMoneyPlain(b.amountCents ?? 0)}</span>
                  </div>
                ))}
              </AlertCard>
              <AlertCard title="Pending approvals" icon={ClipboardCheck}>
                <QueueRow label="Membership applications" value={roleDash.data?.data?.pendingApplications ?? 0} href="/admin/members/applications" />
                <QueueRow label="Loan applications" value={roleDash.data?.data?.pendingLoanApps ?? 0} href="/admin/loans" />
                <QueueRow label="Guarantor consents" value={roleDash.data?.data?.guarantorPending ?? 0} href="/admin/loans" />
                <QueueRow label="Staff leave requests" value={roleDash.data?.data?.leavePending ?? 0} href="/admin/administration" />
              </AlertCard>
              <AlertCard title="Digital payments" icon={Smartphone}>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
                  {o.successfulPayments} successful digital payments processed. M-Pesa STK deposits and repayments post
                  automatically; unallocated funds surface in Digital Payments → Suspense.
                </p>
                <Link href="/admin/payments" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
                  Open payments <ArrowRight className="h-3 w-3" />
                </Link>
              </AlertCard>
            </div>
          </>
        )
      )}

      {/* ---------------- MANAGER console */}
      {desk === 'MANAGER' && <ManagerConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}

      {/* ---------------- TELLER console */}
      {desk === 'TELLER' && <TellerConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}

      {/* ---------------- LOAN OFFICER console */}
      {desk === 'LOAN_OFFICER' && <LoansConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}

      {/* ---------------- ACCOUNTANT console */}
      {desk === 'ACCOUNTANT' && <AccountsConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}

      {/* ---------------- COMPLIANCE console */}
      {desk === 'COMPLIANCE' && <ComplianceConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}

      {/* ---------------- RECEPTION console */}
      {desk === 'RECEPTION' && <ReceptionConsole data={roleDash.data?.data} loading={roleDash.isLoading} />}
    </>
  );
}

/* ============================================================ shared bits */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="public-card section-pad">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function AlertCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode }) {
  return (
    <div className="public-card section-pad">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4" style={{ color: 'var(--t-primary)' }} /> {title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function QueueRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-[var(--t-table-header-a)]">
      <span>{label}</span>
      <span className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-extrabold text-white"
            style={{ background: value > 0 ? 'var(--t-warning)' : 'var(--t-success)' }}>{value}</span>
    </Link>
  );
}

function LoadingGrid() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[...Array(4)].map((_, i) => <div key={i} className="public-card h-28 animate-pulse" />)}</div>;
}

/* ============================================================ MANAGER */

function ManagerConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Active members" value={data.activeMembers.toLocaleString()} tone="primary" />
        <StatCard icon={PiggyBank} label="Member savings" value={data.savingsCents} tone="success" />
        <StatCard icon={Landmark} label="Portfolio outstanding" value={data.portfolioOutstandingCents} sub={`PAR (>30d) ${(data.parRatio * 100).toFixed(1)}%`} tone="info" />
        <StatCard icon={Wallet} label="Cash + bank position" value={data.cashTellerCents + data.bankCents} sub={`Teller ${fmtMoneyPlain(data.cashTellerCents)} · Bank ${fmtMoneyPlain(data.bankCents)}`} tone="warning" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <AlertCard title="Approvals waiting on you" icon={ClipboardCheck}>
          <QueueRow label="Membership applications" value={data.pendingApplications} href="/admin/members/applications" />
          <QueueRow label="Loan applications" value={data.pendingLoanApps} href="/admin/loans" />
          <QueueRow label="Expenses approved — unpaid" value={data.pendingExpenses} href="/admin/accounting" />
          <QueueRow label="Draft reconciliations" value={data.pendingRecons} href="/admin/accounting" />
          <QueueRow label="Leave requests" value={data.leavePending} href="/admin/administration" />
        </AlertCard>
        <AlertCard title="Portfolio health" icon={Scale}>
          <div className="flex items-center justify-between text-sm"><span>Portfolio outstanding</span><strong className="tabular-nums">KES {fmtMoneyPlain(data.portfolioOutstandingCents)}</strong></div>
          <div className="flex items-center justify-between text-sm"><span>PAR &gt; 30 days</span><strong className="tabular-nums" style={{ color: data.parRatio > 0.05 ? 'var(--t-danger)' : 'var(--t-success)' }}>KES {fmtMoneyPlain(data.parCents)} ({(data.parRatio * 100).toFixed(1)}%)</strong></div>
          <div className="flex items-center justify-between text-sm"><span>Collected this month</span><strong className="tabular-nums">KES {fmtMoneyPlain(data.collectedThisMonthCents)}</strong></div>
          <div className="flex items-center justify-between text-sm"><span>Disbursed this month</span><strong className="tabular-nums">KES {fmtMoneyPlain(data.disbursedThisMonthCents)}</strong></div>
        </AlertCard>
        <AlertCard title="Quick actions" icon={Activity}>
          <div className="grid gap-2">
            <Link href="/admin/loans" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]"><Landmark className="h-4 w-4" style={{ color: 'var(--t-primary)' }} /> Vet & approve loans <ArrowRight className="ml-auto h-3 w-3 opacity-50" /></Link>
            <Link href="/admin/accounting" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]"><Scale className="h-4 w-4" style={{ color: 'var(--t-primary)' }} /> Accounting & banks <ArrowRight className="ml-auto h-3 w-3 opacity-50" /></Link>
            <Link href="/admin/reports" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]"><ScrollText className="h-4 w-4" style={{ color: 'var(--t-primary)' }} /> SASRA reports <ArrowRight className="ml-auto h-3 w-3 opacity-50" /></Link>
            <Link href="/admin/communications" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]"><Bell className="h-4 w-4" style={{ color: 'var(--t-primary)' }} /> Broadcast notices <ArrowRight className="ml-auto h-3 w-3 opacity-50" /></Link>
          </div>
        </AlertCard>
      </div>
    </>
  );
}

/* ============================================================ TELLER */

function TellerConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Store} label="My till session" value={data.mySession ? 'OPEN' : 'CLOSED'} sub={data.mySession ? `Since ${fmtDateTime(data.mySession.openedAt)} · ${data.mySession.cashCount} txns today` : 'Open a session in FOSA Teller'} tone={data.mySession ? 'success' : 'warning'} />
        <StatCard icon={Banknote} label="Today's transactions (all tills)" value={data.todayTransactions} sub="Counter volume" tone="primary" />
        <StatCard icon={PiggyBank} label="Today's volume" value={data.todayVolumeCents} sub="Deposits + withdrawals" tone="info" />
        <StatCard icon={Clock3} label="Cheques pending clearing" value={data.pendingCheques} sub="Auto-clear after 3 days" tone="warning" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <AlertCard title="My recent transactions" icon={Store}>
          {data.recent.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No transactions yet today.</p>}
          {data.recent.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="truncate"><strong>{t.type.replace(/_/g, ' ')}</strong> · {t.accountNumber ?? '—'}</span>
              <span className="tabular-nums font-semibold">KES {fmtMoneyPlain(t.amountCents)}</span>
            </div>
          ))}
        </AlertCard>
        <AlertCard title="Open till sessions" icon={Users}>
          {data.openSessions.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No open sessions.</p>}
          {data.openSessions.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span>{s.userName}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--t-muted-text)' }}>float KES {fmtMoneyPlain(s.floatCents)} · {fmtDateTime(s.openedAt)}</span>
            </div>
          ))}
          <Link href="/admin/fosa" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Open FOSA teller console <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
      </div>
    </>
  );
}

/* ============================================================ LOANS */

function LoansConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  const bucketRows = Object.entries(data.arrearsBuckets ?? {}) as [string, number][];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Landmark} label="Active loans" value={data.activeLoans} sub={`${data.inArrears} in arrears`} tone="primary" />
        <StatCard icon={Wallet} label="Outstanding portfolio" value={data.outstandingCents} tone="info" />
        <StatCard icon={AlertTriangle} label="PAR > 30 days" value={`${(data.parRatio * 100).toFixed(1)}%`} sub="Watchlist trigger at 5%" tone={data.parRatio > 0.05 ? 'danger' : 'success'} />
        <StatCard icon={TrendingUp} label="Disbursed this month" value={data.disbursedThisMonthCents} sub={`Due this week: KES ${fmtMoneyPlain(data.dueThisWeekCents)}`} tone="warning" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <AlertCard title="Application queue (oldest first)" icon={ClipboardCheck}>
          {data.queue.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No pending applications — all caught up.</p>}
          {data.queue.map((a: any) => (
            <Link key={a.id} href="/admin/loans" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]">
              <span className="truncate"><strong>{a.memberName}</strong> · {a.productName}</span>
              <span className="tabular-nums font-semibold">KES {fmtMoneyPlain(a.amountCents)}</span>
            </Link>
          ))}
          <Link href="/admin/loans" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Vet applications <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
        <AlertCard title="Arrears aging" icon={FileWarning}>
          {bucketRows.map(([bucket, cents]) => (
            <div key={bucket} className="flex items-center justify-between text-sm">
              <span>{bucket} days</span>
              <span className="tabular-nums font-semibold">KES {fmtMoneyPlain(cents)}</span>
            </div>
          ))}
          <Link href="/admin/loans" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Collection worklist <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
      </div>
    </>
  );
}

/* ============================================================ ACCOUNTS */

function AccountsConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  const balanced = data.trialCheckCents === 0;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Scale} label="Trial balance check" value={balanced ? 'BALANCED ✓' : 'OFF'} sub={`A − L − E − I + Ex = ${fmtMoneyPlain(data.trialCheckCents)}`} tone={balanced ? 'success' : 'danger'} />
        <StatCard icon={Wallet} label="Unallocated funds" value={data.unallocatedCents} sub={`${data.suspenseCount} pending payment(s) to allocate`} tone={data.unallocatedCents === 0 ? 'success' : 'warning'} />
        <StatCard icon={ScrollText} label="Journals this month" value={data.journalsThisMonth} sub="All module postings" tone="info" />
        <StatCard icon={Banknote} label="Draft reconciliations" value={data.draftRecons.length} sub="Difference must be 0 to approve" tone="primary" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <AlertCard title="GL totals by type" icon={Scale}>
          {Object.entries(data.totalsByType ?? {}).map(([type, cents]) => (
            <div key={type} className="flex items-center justify-between text-sm">
              <span className="font-semibold">{type}</span>
              <span className="tabular-nums">KES {fmtMoneyPlain(cents as number)}</span>
            </div>
          ))}
        </AlertCard>
        <AlertCard title="Draft reconciliations" icon={Landmark}>
          {data.draftRecons.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>Nothing pending.</p>}
          {data.draftRecons.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{r.bankName} · to {fmtDate(r.periodTo)}</span>
              <span className="tabular-nums font-semibold" style={{ color: r.differenceCents === 0 ? 'var(--t-success)' : 'var(--t-danger)' }}>
                Δ KES {fmtMoneyPlain(r.differenceCents)}
              </span>
            </div>
          ))}
          <Link href="/admin/accounting" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Reconcile banks <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
        <AlertCard title="Expenses awaiting action" icon={FileWarning}>
          {data.unpaidExpenses.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No open expenses.</p>}
          {data.unpaidExpenses.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{e.description}</span>
              <span className="flex items-center gap-2">
                <span className="public-chip">{e.status}</span>
                <span className="tabular-nums font-semibold">KES {fmtMoneyPlain(e.amountCents)}</span>
              </span>
            </div>
          ))}
          <Link href="/admin/accounting" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Manage expenses <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
      </div>
    </>
  );
}

/* ============================================================ COMPLIANCE */

function ComplianceConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserRound} label="KYC pending" value={data.kycPending} sub="Verify in Members → KYC" tone={data.kycPending > 0 ? 'warning' : 'success'} />
        <StatCard icon={Clock3} label="Dormant accounts" value={data.dormantAccounts} sub="No activity for 365 days" tone="info" />
        <StatCard icon={AlertTriangle} label="Suspended members" value={data.suspendedMembers} sub="Kill-switch active" tone={data.suspendedMembers > 0 ? 'danger' : 'success'} />
        <StatCard icon={FileWarning} label="Overdue installments" value={data.overdueSchedules} sub={`${data.activeLoansCount} active loans`} tone="primary" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <AlertCard title="Critical audit trail (latest)" icon={ScrollText}>
          {data.recentCriticalAudit.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No critical events recorded.</p>}
          {data.recentCriticalAudit.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate"><strong>{a.action.replace(/_/g, ' ')}</strong> · {a.module}</span>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--t-muted-text)' }}>{fmtDateTime(a.createdAt)}{a.userName ? ` · ${a.userName}` : ''}</span>
            </div>
          ))}
          <Link href="/admin/administration" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Full audit trail <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
        <AlertCard title="Dormancy watchlist (longest inactive)" icon={Clock3}>
          {data.dormantList.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No dormant accounts.</p>}
          {data.dormantList.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <span>{a.accountNumber}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--t-muted-text)' }}>{a.lastActivityAt ? `last activity ${fmtDate(a.lastActivityAt)}` : 'never active'}</span>
            </div>
          ))}
          <Link href="/admin/savings" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Savings accounts <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
      </div>
    </>
  );
}

/* ============================================================ RECEPTION */

function ReceptionConsole({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <LoadingGrid />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserPlus} label="Pending applications" value={data.pendingCount} sub="Review within 2 working days" tone={data.pendingCount > 0 ? 'warning' : 'success'} />
        <StatCard icon={CheckCircle2} label="Approved this week" value={data.approvedThisWeek} tone="success" />
        <StatCard icon={Users} label="Total members" value={data.membersTotal.toLocaleString()} tone="primary" />
        <StatCard icon={Bell} label="Newsletter subscribers" value={data.subscribers} sub="Notices & updates opt-ins" tone="info" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <AlertCard title="Latest membership applications" icon={ClipboardCheck}>
          {data.newApplications.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No applications yet.</p>}
          {data.newApplications.map((a: any) => (
            <Link key={a.id} href="/admin/members/applications" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]">
              <span className="truncate"><strong>{a.name}</strong> · {a.ref}</span>
              <span className="flex items-center gap-2">
                <span className="public-chip">{a.status}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--t-muted-text)' }}>{fmtDate(a.createdAt)}</span>
              </span>
            </Link>
          ))}
          <Link href="/admin/members/applications" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Review applications <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertCard>
        <AlertCard title="Newest members" icon={Users}>
          {data.recentMembers.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span><strong>{m.name}</strong> · {m.memberNumber}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--t-muted-text)' }}>joined {fmtDate(m.joinedAt)}</span>
            </div>
          ))}
          <Link href="/admin/members" className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
            Member directory <ArrowRight className="h-3 w-3" />
          </Link>
          <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--t-table-header-a)', color: 'var(--t-muted-text)' }}>
            <PhoneCall className="mr-1 inline h-3.5 w-3.5" style={{ color: 'var(--t-primary)' }} />
            Reception tips: verify IDs at the counter, capture next-of-kin details, and guide new members through the member app install.
          </div>
        </AlertCard>
      </div>
    </>
  );
}
