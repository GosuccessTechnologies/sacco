'use client';
// Admin shell — sidebar grouped by the 12 module groups (guide §2.3 folder map).
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Users, PiggyBank, Landmark, TrendingUp, Store, BookOpen,
  Smartphone, BarChart3, MessageSquare, ShieldCheck, Sun, Moon, LogOut,
  Eye, ChevronDown, Building2,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-permission';
import { Button } from '@/components/ui/button';

const NAV = [
  { group: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, perm: null }] },
  { group: 'Members', items: [
    { href: '/admin/members', label: 'Directory & KYC', icon: Users, perm: 'members_view' },
    { href: '/admin/members/applications', label: 'Applications', icon: Users, perm: 'members_view' },
  ] },
  { group: 'Operations', items: [
    { href: '/admin/savings', label: 'Savings & Deposits', icon: PiggyBank, perm: null },
    { href: '/admin/loans', label: 'Loans & Credit', icon: Landmark, perm: 'loans_view' },
    { href: '/admin/shares', label: 'Shares & Dividends', icon: TrendingUp, perm: null },
    { href: '/admin/fosa', label: 'FOSA Teller', icon: Store, perm: 'fosa_session' },
  ] },
  { group: 'Finance', items: [
    { href: '/admin/accounting', label: 'Accounting', icon: BookOpen, perm: 'accounting_journal' },
    { href: '/admin/payments', label: 'Digital Payments', icon: Smartphone, perm: 'payments_view' },
    { href: '/admin/reports', label: 'Reports & BI', icon: BarChart3, perm: 'analytics_view' },
  ] },
  { group: 'Engagement', items: [
    { href: '/admin/communications', label: 'Communications', icon: MessageSquare, perm: 'comms_logs' },
  ] },
  { group: 'Administration', items: [
    { href: '/admin/administration', label: 'Admin, Security & HR', icon: ShieldCheck, perm: 'users_view' },
  ] },
];

export function AdminShell({ children, entityName }: { children: React.ReactNode; entityName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const [dark, setDark] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [userMenu, setUserMenu] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem('dsms-dark');
    const isDark = stored === '1';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('dsms-dark', next ? '1' : '0');
  }

  async function exitImpersonation() {
    const res = await fetch('/api/admin/impersonate/exit', { method: 'POST' });
    if (res.ok) { router.push('/admin'); router.refresh(); }
  }

  return (
    <div className="flex min-h-screen w-full" style={{ background: 'var(--t-bg)' }}>
      {/* impersonation banner */}
      {user?.actAs && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--t-danger)' }} role="alert">
          <span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Viewing as {user.name} ({user.role}) — read-only while impersonating</span>
          <Button size="sm" variant="outline" onClick={exitImpersonation} className="border-white bg-transparent text-white hover:bg-white/10">Exit</Button>
        </div>
      )}
      {/* sidebar */}
      <aside
        className={`no-print fixed inset-y-0 z-40 w-64 shrink-0 overflow-y-auto transition-transform lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ top: user?.actAs ? 36 : 0, background: 'var(--t-sidebar)', color: 'var(--t-sidebar-text)', width: 256 }}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-2">
          <span className="card-hero grid h-10 w-10 place-items-center rounded-xl text-sm font-black">DS</span>
          <div className="leading-tight">
            <p className="text-sm font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>{entityName}</p>
            <p className="text-[10px] opacity-70">Back-office</p>
          </div>
        </div>
        <nav className="px-3 pb-8 pt-2" aria-label="Admin navigation">
          {NAV.map((section) => {
            const visible = section.items.filter((i) => !i.perm || user?.role === 'SUPER_ADMIN' || user?.permissions?.includes(i.perm as never));
            if (!visible.length) return null;
            return (
              <div key={section.group} className="mb-4">
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-50">{section.group}</p>
                {visible.map((item) => {
                  const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                      style={active
                        ? { background: 'var(--t-primary)', color: '#fff' }
                        : { background: 'transparent' }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.08)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="no-print sticky z-30 flex h-14 items-center justify-between gap-3 border-b px-4 lg:px-6"
          style={{ top: user?.actAs ? 36 : 0, background: 'var(--t-header)', color: 'var(--t-header-text)', borderColor: 'var(--t-border)' }}
        >
          <div className="flex items-center gap-3">
            <button className="grid h-9 w-9 place-items-center rounded-lg lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
              <Building2 className="h-5 w-5" />
            </button>
            <p className="hidden text-sm font-semibold sm:block" style={{ fontFamily: 'var(--t-heading-font)' }}>
              {user?.actAs ? `${user.name} — ` : ''}{user?.role === 'SUPER_ADMIN' ? 'Super Administrator' : user?.designation ? `${user.designation.replace(/_/g, ' ')} console` : 'Console'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleDark} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--t-primary)]/10" aria-label="Toggle dark mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button onClick={() => setUserMenu(!userMenu)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-[var(--t-primary)]/10" aria-label="Account menu">
                <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--t-primary)' }}>
                  {user?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('') ?? '?'}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {userMenu && (
                <div className="dsms-pop absolute right-0 mt-2 w-56 rounded-xl border p-2 shadow-xl" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                  <p className="px-3 py-1.5 text-xs" style={{ color: 'var(--t-muted-text)' }}>{user?.email}</p>
                  {user?.role === 'MEMBER' && <Link href="/dashboard" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--t-table-header-a)]">Member portal</Link>}
                  <Link href="/" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--t-table-header-a)]">Public website</Link>
                  <button onClick={() => signOut({ callbackUrl: '/' })} className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[var(--t-danger)] hover:bg-[var(--t-danger)]/10">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="section-pad min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
