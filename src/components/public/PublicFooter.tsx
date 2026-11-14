'use client';
// ============================================================================
// Public footer — premium 4-column layout, fully dynamic from entity config +
// live product lists + social credentials. Theme-token driven.
// ============================================================================
import * as React from 'react';
import Link from 'next/link';
import { Youtube, Facebook, Music2, MessageCircle, Twitter, Linkedin, Mail, MapPin, Phone, Send, ChevronRight, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { EntityConfig } from '@/lib/settings-defaults';

export function PublicFooter({
  entity,
  savingsProducts,
  loanProducts,
  social,
}: {
  entity: EntityConfig;
  savingsProducts: { name: string; code: string }[];
  loanProducts: { name: string; code: string }[];
  social: Record<string, string>;
}) {
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) { toast({ title: 'Enter an email or phone number', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/public/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not subscribe');
      toast({ title: 'Subscribed!', description: 'You will receive our notices and product updates.' });
      setEmail(''); setPhone(''); setName('');
    } catch (err) {
      toast({ title: 'Subscription failed', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  const socials: [string, string, React.ComponentType<{ className?: string }>][] = [
    ['YouTube', social.youtube ?? '', Youtube],
    ['TikTok', social.tiktok ?? '', Music2],
    ['Facebook', social.facebook ?? '', Facebook],
    ['WhatsApp Channel', social.whatsapp ?? '', MessageCircle],
    ['X (Twitter)', social.twitter ?? '', Twitter],
    ['LinkedIn', social.linkedin ?? '', Linkedin],
  ].filter(([, href]) => Boolean(href)) as [string, string, React.ComponentType<{ className?: string }>][];


  return (
    <footer className="mt-auto no-print" style={{ background: 'var(--t-footer)', color: 'var(--t-footer-text)' }}>
      <div className="public-container grid w-full gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.25fr_.85fr_.85fr_1.05fr]">
        {/* brand + contact */}
        <div>
          <div className="flex items-center gap-3">
            <span className="card-hero grid h-11 w-11 place-items-center rounded-xl text-sm font-black">
              {entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <div className="leading-tight">
              <h3 className="text-base font-extrabold" style={{ fontFamily: 'var(--t-heading-font)' }}>{entity.name}</h3>
              <p className="text-[11px] opacity-75">{entity.tagline}</p>
            </div>
          </div>
          <ul className="mt-5 space-y-2.5 text-xs leading-relaxed opacity-90">
            <li className="flex gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {entity.physicalAddress}, {entity.town} {entity.postalCode ? `· P.O. Box ${entity.postalCode}` : ''}, {entity.country}</li>
            <li className="flex gap-2"><Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <a className="public-footer-link" href={`tel:${entity.phone.replace(/\s/g, '')}`}>{entity.phone}</a>{entity.altPhone ? <> · <a className="public-footer-link" href={`tel:${entity.altPhone.replace(/\s/g, '')}`}>{entity.altPhone}</a></> : null}</li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <a className="public-footer-link" href={`mailto:${entity.email}`}>{entity.email}</a></li>
            <li className="flex items-center gap-2 opacity-75"><ShieldCheck className="h-3.5 w-3.5" /> Reg {entity.registrationNo} · SASRA regulated</li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map(([label, href, Icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                   className="grid h-9 w-9 place-items-center rounded-lg transition-transform hover:-translate-y-0.5"
                   style={{ background: 'rgba(255,255,255,.12)' }}>
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* products */}
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-widest">Savings</h4>
          <ul className="mt-4 space-y-2 text-xs opacity-90">
            {savingsProducts.map((p) => <li key={p.code}><Link href="/#products" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />{p.name}</Link></li>)}
          </ul>
          <h4 className="mt-6 text-xs font-extrabold uppercase tracking-widest">Loans</h4>
          <ul className="mt-4 space-y-2 text-xs opacity-90">
            {loanProducts.map((p) => <li key={p.code}><Link href="/#products" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />{p.name}</Link></li>)}
          </ul>
        </div>

        {/* quick links */}
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-widest">Quick links</h4>
          <ul className="mt-4 space-y-2 text-xs opacity-90">
            <li><Link href="/apply" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Apply for membership</Link></li>
            <li><Link href="/login" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Member login</Link></li>
            <li><Link href="/#calculator" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Loan calculator</Link></li>
            <li><Link href="/#about" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />About the Sacco</Link></li>
            <li><Link href="/#why" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Why choose us</Link></li>
            <li><Link href="/contact" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Contact &amp; locations</Link></li>
            <li><Link href="/sitemap.xml" className="public-footer-link inline-flex items-center gap-1"><ChevronRight className="h-3 w-3 opacity-50" />Sitemap</Link></li>
          </ul>
        </div>

        {/* newsletter */}
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-widest">Stay in touch</h4>
          <p className="mt-4 text-xs leading-relaxed opacity-80">
            Get meeting notices, product launches and dividend announcements straight to your inbox or phone.
          </p>
          <form onSubmit={subscribe} className="mt-4 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name"
                   className="w-full rounded-lg border px-3 py-2 text-xs"
                   style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.25)', color: 'inherit' }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" aria-label="Email address"
                   className="w-full rounded-lg border px-3 py-2 text-xs"
                   style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.25)', color: 'inherit' }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone (optional)" aria-label="Phone number"
                   className="w-full rounded-lg border px-3 py-2 text-xs"
                   style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.25)', color: 'inherit' }} />
            <button type="submit" disabled={busy} className="public-btn-primary w-full justify-center !py-2 text-xs" style={{ background: 'var(--t-accent)', color: 'var(--t-accent-fg)' }}>
              <Send className="h-3.5 w-3.5" /> {busy ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        </div>
      </div>
      <div className="border-t py-4 text-center text-[11px] opacity-75" style={{ borderColor: 'rgba(255,255,255,.15)' }}>
        © {new Date().getFullYear()} {entity.name}. {entity.slogan}. Reg {entity.registrationNo}. All rights reserved.
      </div>
    </footer>
  );
}
