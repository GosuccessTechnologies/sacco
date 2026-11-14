'use client';
// ============================================================================
// Public header — two-tier premium design (stima/hazina/nationsacco inspired).
// TOPBAR: phone · alt phone · email · socials · login · signup (dark strip)
// NAVBAR: logo + entity name + slogan · links + products dropdown · CTA
// Everything dynamic from entity config; session-aware CTAs.
// ============================================================================
import * as React from 'react';
import Link from 'next/link';
import {
  Menu, X, LogIn, UserPlus, Phone, Mail, ChevronDown, MapPin,
  Youtube, Facebook, Music2, MessageCircle, Twitter, Linkedin,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import type { EntityConfig } from '@/lib/settings-defaults';

export interface PublicNavProduct { name: string; code: string; kind: 'savings' | 'loan' }

export function PublicHeader({
  entity, logoUrl, savingsProducts, loanProducts, social,
}: {
  entity: EntityConfig;
  logoUrl: string | null;
  savingsProducts: PublicNavProduct[];
  loanProducts: PublicNavProduct[];
  social: Record<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [prodOpen, setProdOpen] = React.useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const isMember = session?.user?.role === 'MEMBER';
  const isStaff = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN';

  const nav = [
    { href: '/', label: 'Home' },
    { href: '/#products', label: 'Products', dropdown: true },
    { href: '/#about', label: 'About us' },
    { href: '/#why', label: 'Why us' },
    { href: '/contact', label: 'Contact' },
  ];

  const socials: [string, string, React.ComponentType<{ className?: string }>][] = [
    ['YouTube', social.youtube ?? '', Youtube],
    ['TikTok', social.tiktok ?? '', Music2],
    ['Facebook', social.facebook ?? '', Facebook],
    ['WhatsApp', social.whatsapp ?? '', MessageCircle],
    ['X', social.twitter ?? '', Twitter],
    ['LinkedIn', social.linkedin ?? '', Linkedin],
  ].filter(([, href]) => Boolean(href)) as [string, string, React.ComponentType<{ className?: string }>][];

  const tel = entity.phone.replace(/[\s]/g, '');

  return (
    <header className="sticky top-0 z-40 no-print">
      {/* ---------------------------------------------- TOPBAR */}
      <div className="public-topbar hidden md:block">
        <div className="public-container flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-4 overflow-hidden">
            <a href={`tel:${tel}`} className="public-topbar-link shrink-0"><Phone style={{ height: 12, width: 12 }} /> {entity.phone}</a>
            {entity.altPhone && <a href={`tel:${entity.altPhone.replace(/[\s]/g, '')}`} className="public-topbar-link shrink-0"><Phone style={{ height: 12, width: 12 }} /> {entity.altPhone}</a>}
            <a href={`mailto:${entity.email}`} className="public-topbar-link shrink-0"><Mail style={{ height: 12, width: 12 }} /> {entity.email}</a>
            <span className="hidden items-center gap-1.5 truncate opacity-80 lg:inline-flex"><MapPin style={{ height: 12, width: 12 }} /> {entity.physicalAddress}, {entity.town}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {socials.map(([label, href, Icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="public-topbar-social">
                  <Icon className="h-3 w-3" />
                </a>
              ))}
            </div>
            <span className="h-4 w-px bg-white/25" />
            {isMember ? (
              <Link href="/dashboard" className="public-topbar-link font-bold"><LogIn style={{ height: 12, width: 12 }} /> Member portal</Link>
            ) : isStaff ? (
              <Link href="/admin" className="public-topbar-link font-bold"><LogIn style={{ height: 12, width: 12 }} /> Back-office</Link>
            ) : (
              <Link href="/login" className="public-topbar-link font-bold"><LogIn style={{ height: 12, width: 12 }} /> Member login</Link>
            )}
            <Link href="/apply" className="public-topbar-link font-bold text-[color:var(--t-accent)]"><UserPlus style={{ height: 12, width: 12 }} /> Sign up</Link>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- NAVBAR */}
      <div className="public-navbar border-b" style={{ borderColor: 'var(--t-border)' }}>
        <div className="public-container flex h-[72px] items-center justify-between gap-4">
          {/* logo + entity identity */}
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${entity.name} home`}>
            {logoUrl ? (
              <img src={logoUrl} alt={`${entity.name} logo`} className="h-11 w-auto rounded-lg" />
            ) : (
              <span className="card-hero grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black">
                {entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <strong className="block truncate text-[15px]" style={{ fontFamily: 'var(--t-heading-font)' }}>{entity.name}</strong>
              <span className="block truncate text-[11px]" style={{ color: 'var(--t-muted-text)' }}>{entity.slogan}</span>
            </span>
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">
            {nav.map((n) =>
              n.dropdown ? (
                <div key={n.href} className="relative" onMouseEnter={() => setProdOpen(true)} onMouseLeave={() => setProdOpen(false)}>
                  <Link href={n.href} className="public-nav-link inline-flex items-center gap-1" data-active={pathname === n.href}>
                    {n.label} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Link>
                  {prodOpen && (
                    <div className="dsms-pop absolute left-1/2 top-full z-50 w-72 -translate-x-1/2 pt-2">
                      <div className="rounded-xl border p-3 shadow-2xl" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)' }}>
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--t-muted-text)' }}>Savings accounts</p>
                        {savingsProducts.slice(0, 6).map((p) => (
                          <Link key={p.code} href={`/#products`} className="block rounded-lg px-2 py-1.5 text-[13px] font-medium hover:bg-[var(--t-table-header-a)]" onClick={() => setProdOpen(false)}>{p.name}</Link>
                        ))}
                        <p className="mt-2 px-2 pb-1 text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--t-muted-text)' }}>Loans</p>
                        {loanProducts.slice(0, 6).map((p) => (
                          <Link key={p.code} href={`/#products`} className="block rounded-lg px-2 py-1.5 text-[13px] font-medium hover:bg-[var(--t-table-header-a)]" onClick={() => setProdOpen(false)}>{p.name}</Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link key={n.href} href={n.href} className="public-nav-link" data-active={pathname === n.href && n.href !== '/' ? true : undefined}>{n.label}</Link>
              ),
            )}
          </nav>

          {/* desktop CTAs */}
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <a href={`tel:${tel}`} className="public-btn-ghost !px-4 !py-2 text-xs"><Phone className="h-3.5 w-3.5" /> Call us</a>
            {isMember ? (
              <Link href="/dashboard" className="public-btn-primary !px-5 !py-2 text-xs">My portal</Link>
            ) : isStaff ? (
              <Link href="/admin" className="public-btn-primary !px-5 !py-2 text-xs">Back-office</Link>
            ) : (
              <Link href="/apply" className="public-btn-primary !px-5 !py-2 text-xs"><UserPlus className="h-3.5 w-3.5" /> Become a member</Link>
            )}
          </div>

          {/* mobile toggle */}
          <button className="grid h-10 w-10 place-items-center rounded-lg lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* mobile drawer */}
        {open && (
          <div className="border-t px-4 pb-5 pt-3 lg:hidden" style={{ background: 'var(--t-header)' }}>
            <div className="public-topbar mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-3 py-2">
              <a href={`tel:${tel}`} className="public-topbar-link"><Phone style={{ height: 12, width: 12 }} /> {entity.phone}</a>
              <a href={`mailto:${entity.email}`} className="public-topbar-link"><Mail style={{ height: 12, width: 12 }} /> Email us</a>
              <div className="flex items-center gap-1.5">
                {socials.map(([label, href, Icon]) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="public-topbar-social"><Icon className="h-3 w-3" /></a>
                ))}
              </div>
            </div>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-2.5 text-sm font-semibold">
                {n.label}
              </Link>
            ))}
            <hr className="public-divider my-2" />
            {isMember ? (
              <Link href="/dashboard" onClick={() => setOpen(false)} className="public-btn-primary mt-2 w-full justify-center text-sm">My portal</Link>
            ) : isStaff ? (
              <Link href="/admin" onClick={() => setOpen(false)} className="public-btn-primary mt-2 w-full justify-center text-sm">Back-office</Link>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link href="/login" onClick={() => setOpen(false)} className="public-btn-ghost flex-1 justify-center text-sm"><LogIn className="h-4 w-4" /> Login</Link>
                <Link href="/apply" onClick={() => setOpen(false)} className="public-btn-primary flex-1 justify-center text-sm">Join</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
