'use client';
// ============================================================================
// Login — premium equal-split layout (Instr 4). Standalone: NO shared header
// or footer. Left brand panel (dynamic entity data) + right form panel.
// Mobile: brand collapses to a compact strip above the form.
// ============================================================================
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  LogIn, ShieldCheck, Smartphone, Eye, EyeOff, ArrowLeft, ArrowRight,
  Phone, Lock, User, TrendingUp, Landmark, BadgeCheck, HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

export interface LoginBrand {
  name: string; tagline: string; slogan: string;
  phone: string; email: string; website: string;
  logoUrl: string | null;
}

export function LoginForm({ brand }: { brand: LoginBrand }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await signIn('credentials', { identifier, password, redirect: false });
      if (res?.error) {
        setError('Invalid credentials, a suspended account, or member self-service is temporarily disabled. Contact the office if this persists.');
        return;
      }
      const sres = await fetch('/api/auth/session');
      const session = await sres.json();
      const role = session?.user?.role;
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : role === 'MEMBER' ? '/dashboard' : '/admin';
      router.push(dest);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const initials = brand.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      {/* ================================================= BRAND PANEL */}
      <aside className="public-hero relative isolate hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14" style={{ color: 'var(--t-card-hero-fg)' }}>
        <div className="public-hero-grid" />
        <div className="public-hero-blob right-[-15%] top-[-10%] h-96 w-96" style={{ background: 'var(--t-accent)' }} />
        <div className="public-hero-blob left-[-10%] bottom-[-15%] h-96 w-96" style={{ background: 'var(--t-info)' }} />

        <div className="relative flex items-center gap-3">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={`${brand.name} logo`} className="h-12 w-auto rounded-xl bg-white/10 p-1" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-base font-black">{initials}</span>
          )}
          <div className="leading-tight">
            <p className="text-[15px] font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>{brand.name}</p>
            <p className="text-[11px] opacity-80">{brand.slogan}</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight" style={{ fontFamily: 'var(--t-heading-font)' }}>
            Welcome back to your financial home.
          </h1>
          <p className="mt-4 text-sm leading-relaxed opacity-90">
            {brand.tagline} — check balances, apply for loans, repay via M-Pesa and track dividends from one secure place.
          </p>
          <div className="mt-8 space-y-4">
            {[
              { icon: TrendingUp, text: 'Live balances, e-statements and dividend history' },
              { icon: Landmark, text: 'Loan applications with instant EMI preview' },
              { icon: Smartphone, text: 'M-Pesa deposits & repayments in seconds' },
              { icon: BadgeCheck, text: 'SASRA regulated · audited annually' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-[13px] font-medium">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15"><Icon className="h-4 w-4" /></span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-5 text-[12px] font-semibold opacity-90">
          <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {brand.phone}</a>
          <a href={`mailto:${brand.email}`} className="inline-flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> {brand.email}</a>
        </div>
      </aside>

      {/* ================================================= FORM PANEL */}
      <main className="flex min-h-screen flex-col bg-[var(--t-bg)] px-5 py-8 sm:px-10 lg:px-16" style={{ color: 'var(--t-text)' }}>
        {/* mobile brand strip */}
        <div className="mb-8 flex items-center justify-between lg:mb-0 lg:hidden">
          <div className="flex items-center gap-2.5">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={`${brand.name} logo`} className="h-10 w-auto rounded-lg" />
            ) : (
              <span className="card-hero grid h-10 w-10 place-items-center rounded-xl text-xs font-black">{initials}</span>
            )}
            <div className="leading-tight">
              <p className="text-[13px] font-extrabold">{brand.name}</p>
              <p className="text-[10px]" style={{ color: 'var(--t-muted-text)' }}>{brand.slogan}</p>
            </div>
          </div>
          <Link href="/" className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--t-primary)' }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Website
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-7 hidden items-center justify-between lg:flex">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--t-muted-text)' }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to website
              </Link>
              <span className="public-chip">Secure sign in</span>
            </div>

            <div className="public-card section-pad sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="card-hero grid h-12 w-12 place-items-center rounded-xl"><LogIn className="h-6 w-6" /></span>
                <div>
                  <h2 className="text-xl font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>Sign in</h2>
                  <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Members, staff and administrators — one door.</p>
                </div>
              </div>

              {error && (
                <div role="alert" className="mb-4 rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: 'var(--t-danger)', background: 'color-mix(in srgb, var(--t-danger) 8%, transparent)', color: 'var(--t-danger)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label htmlFor="identifier" className="mb-1.5 block text-xs font-bold">Email or phone</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
                    <input
                      id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
                      autoComplete="username" placeholder="you@example.com or +2547…"
                      className="dsms-input h-12 pl-10"
                      style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.10)' }}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-xs font-bold">Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
                    <input
                      id="password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      required autoComplete="current-password" placeholder="••••••••"
                      className="dsms-input h-12 pl-10 pr-11"
                      style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.10)' }}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md opacity-50 hover:opacity-100">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="inline-flex cursor-pointer items-center gap-2 font-medium" style={{ color: 'var(--t-muted-text)' }}>
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: 'var(--t-primary)' }} />
                    Keep me signed in
                  </label>
                  <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--t-muted-text)' }}>
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--t-primary)' }} /> Encrypted session
                  </span>
                </div>

                <button type="submit" disabled={busy} className="public-btn-primary w-full justify-center !py-3.5 text-sm disabled:opacity-60">
                  {busy ? 'Signing in…' : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>

              <hr className="public-divider my-6" />

              <div className="grid gap-2.5 text-xs" style={{ color: 'var(--t-muted-text)' }}>
                <p className="flex items-start gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--t-primary)' }} />
                  Members: after first login, install the {brand.name} app from your dashboard — it works exactly like a mobile app.
                </p>
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--t-primary)' }} />
                  Accounts lock for 15 minutes after 5 failed attempts. Need help? Call <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="font-bold" style={{ color: 'var(--t-primary)' }}>{brand.phone}</a>.
                </p>
                <p>Not a member yet? <Link href="/apply" className="font-extrabold" style={{ color: 'var(--t-primary)' }}>Apply online in 5 steps</Link>.</p>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--t-muted-text)' }}>
              © {new Date().getFullYear()} {brand.name}. All rights reserved.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
