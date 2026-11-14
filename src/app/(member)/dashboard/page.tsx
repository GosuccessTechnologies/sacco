'use client';
// ============================================================================
// Member dashboard home — premium overview (Instr 7).
// Welcome hero, savings/loan/share/guarantor cards, next installment tracker,
// quick actions, accounts list, notifications preview.
// ============================================================================
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  PiggyBank, Landmark, TrendingUp, Bell, ChevronRight, Users, Smartphone,
  CalendarClock, Wallet, ArrowRight, ShieldCheck, BadgeCheck,
} from 'lucide-react';
import { fmtMoneyPlain, fmtDate } from '@/lib/client-utils';
import { useCurrentUser } from '@/hooks/use-permission';

const greet = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function MemberHome() {
  const user = useCurrentUser();
  const overview = useQuery({ queryKey: ['member-overview'], queryFn: async () => (await fetch('/api/member/savings?want=overview')).json() });
  const notifications = useQuery({ queryKey: ['member-notifications'], queryFn: async () => (await fetch('/api/notifications')).json() });
  const o = overview.data;

  if (overview.isLoading || !o) {
    return <div className="grid gap-3 sm:grid-cols-2">{[...Array(4)].map((_, i) => <div key={i} className="public-card h-28 animate-pulse" />)}</div>;
  }

  const dueSoon = o.nextDueDate ? (new Date(o.nextDueDate).getTime() - Date.now()) / 86_400_000 : null;

  return (
    <div className="space-y-6">
      {/* ---------------- welcome hero */}
      <div className="card-hero flex flex-col gap-4 rounded-2xl px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>
            {greet()}, {user?.name?.split(' ')[0] ?? 'member'} 👋
          </h1>
          <p className="mt-1 text-sm opacity-90">Everything about your membership in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/loans" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold transition hover:bg-white/25">
            <Landmark className="h-3.5 w-3.5" /> Apply for a loan
          </Link>
          <Link href="/dashboard/savings" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold transition hover:bg-white/25">
            <Smartphone className="h-3.5 w-3.5" /> Deposit via M-Pesa
          </Link>
        </div>
      </div>

      {/* ---------------- overview cards */}
      <section aria-label="My overview">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card icon={PiggyBank} label="Total savings" value={'KES ' + fmtMoneyPlain(o.totalSavingsCents)} sub={`${o.accounts} account(s)`} href="/dashboard/savings" />
          <Card icon={TrendingUp} label="My shares" value={`${o.shares}`} sub={'KES ' + fmtMoneyPlain(o.shareValueCents) + ' value'} href="/dashboard/shares" />
          <Card icon={Landmark} label="Loan outstanding" value={o.loanOutstandingCents ? 'KES ' + fmtMoneyPlain(o.loanOutstandingCents) : 'No active loan'} sub={o.nextInstallmentCents ? `Next: KES ${fmtMoneyPlain(o.nextInstallmentCents)}` : 'Apply from the Loans tab'} href="/dashboard/loans" />
          <Card icon={Users} label="Guarantor requests" value={String(o.guarantorRequests)} sub={o.guarantorRequests ? 'Action needed — respond now' : 'None pending'} href="/dashboard/guarantors" accent={o.guarantorRequests > 0} />
        </div>
      </section>

      {/* ---------------- next installment tracker */}
      {o.nextInstallmentCents && o.nextDueDate && (
        <section aria-label="Next installment" className="public-card section-pad">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="public-icon-badge"><CalendarClock className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-bold">Next installment — KES {fmtMoneyPlain(o.nextInstallmentCents)}</p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>
                  Due {fmtDate(o.nextDueDate)}
                  {dueSoon !== null && dueSoon <= 7 && dueSoon >= 0 ? ` · in ${Math.ceil(dueSoon)} day(s)` : dueSoon !== null && dueSoon < 0 ? ` · overdue by ${Math.abs(Math.floor(dueSoon))} day(s)` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/loans" className="public-btn-dark !px-5 !py-2 text-xs">Repay now <ArrowRight className="h-3.5 w-3.5" /></Link>
              <Link href="/dashboard/savings" className="public-btn-ghost !px-5 !py-2 text-xs">View statements</Link>
            </div>
          </div>
          {dueSoon !== null && dueSoon <= 7 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'color-mix(in srgb, var(--t-warning) 10%, transparent)', color: 'var(--t-warning)' }}>
              Your installment is due within a week — repay via M-Pesa or at the counter to keep your loan healthy.
            </div>
          )}
        </section>
      )}

      {o.heldFundsCents > 0 && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--t-warning)', background: 'color-mix(in srgb, var(--t-warning) 8%, transparent)' }}>
          <strong style={{ color: 'var(--t-warning)' }}>KES {fmtMoneyPlain(o.heldFundsCents)} of your savings is on guarantee hold.</strong>{' '}
          <span style={{ color: 'var(--t-muted-text)' }}>It releases automatically when the guaranteed loan is settled.</span>
        </div>
      )}

      {/* ---------------- quick actions */}
      <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
        <Quick href="/dashboard/loans" icon={Landmark} title="Apply for a loan" desc="Products with live EMI preview; or ask the office to apply on your behalf." />
        <Quick href="/dashboard/savings" icon={Smartphone} title="Deposit via M-Pesa" desc="STK push to your paybill reference — posts instantly." />
        <Quick href="/dashboard/notifications" icon={Bell} title={`${o.unreadNotifications} unread alerts`} desc="Approvals, dues, dividends and receipts." />
      </section>

      {/* ---------------- accounts + notifications */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="My accounts" className="public-card section-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">My accounts</h2>
            <Link href="/dashboard/savings" className="inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
              All savings <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {o.accountList?.length === 0 && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No savings accounts yet — visit the office or contact us to open one.</p>}
          {o.accountList?.map((a: any) => (
            <Link key={a.id} href="/dashboard/savings" className="mb-2 flex items-center justify-between rounded-xl p-3 transition hover:brightness-[.98]" style={{ background: 'var(--t-table-header-a)' }}>
              <span>
                <strong className="block text-sm">{a.accountNumber}</strong>
                <span className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{a.product}</span>
              </span>
              <span className="text-right">
                <strong className="block text-sm tabular-nums">KES {fmtMoneyPlain(a.balanceCents)}</strong>
                <span className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{a.status}</span>
              </span>
              <ChevronRight className="h-4 w-4 opacity-50" />
            </Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--t-table-header-a)' }}>
              <p className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t-muted-text)' }}><Wallet className="h-3 w-3" /> TOTAL SAVINGS</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums">KES {fmtMoneyPlain(o.totalSavingsCents)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--t-table-header-a)' }}>
              <p className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--t-muted-text)' }}><BadgeCheck className="h-3 w-3" /> SHARES VALUE</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums">KES {fmtMoneyPlain(o.shareValueCents)}</p>
            </div>
          </div>
        </section>

        <section aria-label="Recent alerts" className="public-card section-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Recent alerts</h2>
            <Link href="/dashboard/notifications" className="inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
              All <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {(!notifications.data || (notifications.data ?? []).length === 0) && (
              <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No notifications yet — approvals, dues and dividends will appear here.</p>
            )}
            {(notifications.data ?? []).slice(0, 5).map((n: any) => (
              <div key={n.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--t-border)' }}>
                <p className="flex items-center gap-1.5 text-[13px] font-bold">
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: n.type === 'WARNING' ? 'var(--t-warning)' : 'var(--t-primary)' }} />
                  {n.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>{n.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, sub, href, accent }: any) {
  return (
    <Link href={href} className="public-card public-card-hover p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold" style={{ color: 'var(--t-muted-text)' }}>{label}</p>
        <Icon className="h-4 w-4" style={{ color: accent ? 'var(--t-warning)' : 'var(--t-primary)' }} />
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{sub}</p>
    </Link>
  );
}

function Quick({ href, icon: Icon, title, desc }: any) {
  return (
    <Link href={href} className="public-card public-card-hover section-pad">
      <Icon className="mb-2 h-6 w-6" style={{ color: 'var(--t-primary)' }} />
      <p className="text-sm font-bold">{title}</p>
      <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{desc}</p>
    </Link>
  );
}
