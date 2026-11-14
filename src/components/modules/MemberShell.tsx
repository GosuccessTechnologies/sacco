'use client';
// Member PWA shell — app-like top bar + bottom tab nav + install prompt + notifications bell.
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Home, PiggyBank, Landmark, TrendingUp, Bell, UserRound, LogOut, Download, X, Smartphone, ChevronRight } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-permission';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

export function MemberShell({ children, entityName, tagline }: { children: React.ReactNode; entityName: string; tagline: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showInstall, setShowInstall] = React.useState(false);
  const [iosTip, setIosTip] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const seen = sessionStorage.getItem('dsms-install-dismissed');
      if (!seen) setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos && !sessionStorage.getItem('dsms-install-dismissed')) setIosTip(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const res = await deferredPrompt.userChoice;
    if (res?.outcome === 'accepted') toastInstalled();
    setDeferredPrompt(null);
    setShowInstall(false);
  }
  function toastInstalled() {
    sessionStorage.setItem('dsms-install-dismissed', '1');
  }

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await fetch('/api/notifications')).json(),
  });
  const unread = (notifications.data ?? []).filter((n: any) => !n.read).length;

  const tabs = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/savings', label: 'Savings', icon: PiggyBank },
    { href: '/dashboard/loans', label: 'Loans', icon: Landmark },
    { href: '/dashboard/shares', label: 'Shares', icon: TrendingUp },
    { href: '/dashboard/profile', label: 'Profile', icon: UserRound },
  ];

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}>
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b no-print" style={{ background: 'var(--t-sidebar)', color: 'var(--t-sidebar-text)', borderColor: 'rgba(255,255,255,.14)' }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-black" style={{ background: 'var(--t-primary)', color: '#fff' }}>DS</span>
            <span className="leading-tight">
              <strong className="block text-sm" style={{ fontFamily: 'var(--t-heading-font)' }}>{entityName}</strong>
              <span className="block text-[10px] opacity-70">{tagline}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/dashboard/notifications" aria-label={`Notifications (${unread} unread)`} className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10">
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: 'var(--t-danger)' }}>{unread}</span>}
            </Link>
            {user?.actAs && <Badge className="ml-1 hidden sm:inline-flex" style={{ background: 'var(--t-danger)', color: '#fff' }}>view-only</Badge>}
            <button onClick={() => signOut({ callbackUrl: '/' })} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* PWA install interstitial (first login) */}
      {(showInstall || iosTip) && (
        <div className="no-print mx-auto mt-4 w-full max-w-3xl px-4">
          <div className="card-hero flex items-center justify-between gap-3 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-8 w-8" />
              <div>
                <p className="text-sm font-bold">Install the Divine Sacco app</p>
                <p className="text-xs opacity-90">
                  {iosTip
                    ? 'On iPhone: tap Share → “Add to Home Screen” for the full app experience.'
                    : 'One tap — it then works like a native mobile app, even offline.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!iosTip && <button onClick={install} className="rounded-full px-4 py-2 text-xs font-bold" style={{ background: '#fff', color: 'var(--t-primary)' }}>
                <Download className="mr-1 inline h-3.5 w-3.5" /> Install
              </button>}
              <button aria-label="Dismiss" onClick={() => { sessionStorage.setItem('dsms-install-dismissed', '1'); setShowInstall(false); setIosTip(false); }} className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-24 lg:pb-8">{children}</main>

      {/* bottom tab nav (mobile-first PWA feel) */}
      <nav aria-label="Member navigation" className="no-print fixed inset-x-0 bottom-0 z-30 border-t lg:hidden" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
                    className="flex flex-col items-center gap-1 py-2 text-[10px] font-semibold"
                    style={{ color: active ? 'var(--t-primary)' : 'var(--t-muted-text)' }}>
                <t.icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {/* desktop side rail */}
      <aside className="no-print fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl border p-2 lg:flex" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)' }}>
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} title={t.label} aria-label={t.label}
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: active ? 'var(--t-primary)' : 'transparent', color: active ? '#fff' : 'var(--t-muted-text)' }}>
              <t.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </aside>
    </div>
  );
}
