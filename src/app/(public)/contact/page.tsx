import type { Metadata } from 'next';
import {
  MapPin, Phone, Mail, Globe, ChevronRight, Clock3, ShieldCheck,
  Youtube, Facebook, Music2, MessageCircle, Twitter, Linkedin, Send,
} from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { decryptJson } from '@/lib/core-utils';
import { PublicSubscribeForm } from '@/components/public/SubscribeForm';

export const metadata: Metadata = { title: 'Contact & Locations' };
export const revalidate = 60;

export default async function ContactPage() {
  const entity = await getSettings('entity');
  const socialRow = await db.integrationCredential.findUnique({ where: { provider: 'SOCIAL' } }).catch(() => null);
  let social: Record<string, string> = {};
  if (socialRow?.config) {
    try { social = decryptJson<Record<string, string>>(socialRow.config as unknown as string); } catch { /* not set */ }
  }
  const socials: [string, string, React.ComponentType<{ className?: string }>][] = [
    ['YouTube', social.youtube ?? '', Youtube],
    ['TikTok', social.tiktok ?? '', Music2],
    ['Facebook', social.facebook ?? '', Facebook],
    ['WhatsApp Channel', social.whatsapp ?? '', MessageCircle],
    ['X (Twitter)', social.twitter ?? '', Twitter],
    ['LinkedIn', social.linkedin ?? '', Linkedin],
  ].filter(([, href]) => Boolean(href)) as [string, string, React.ComponentType<{ className?: string }>][];

  const tel = entity.phone.replace(/\s/g, '');

  return (
    <>
      {/* ============================================ PAGE HERO HEADER */}
      <section className="public-page-hero relative isolate">
        <div className="public-hero-grid" />
        <div className="public-hero-blob left-[-5%] top-[-40%] h-80 w-80" style={{ background: 'var(--t-accent)' }} />
        <div className="public-container relative py-12 md:py-16" style={{ color: 'var(--t-card-hero-fg)' }}>
          <nav className="public-breadcrumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <ChevronRight className="h-3 w-3 opacity-70" />
            <span aria-current="page">Contact &amp; locations</span>
          </nav>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight md:text-4xl" style={{ fontFamily: 'var(--t-heading-font)' }}>
            We are here for you
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-90">
            Talk to {entity.name} — visit our offices, call, email or follow our channels. Member service hours: Mon–Fri 8:30am–5:00pm, Sat 9:00am–1:00pm.
          </p>
        </div>
      </section>

      {/* ============================================ CONTACT CARDS */}
      <section className="py-14 md:py-16" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="public-card public-card-hover public-card-top section-pad">
              <span className="public-icon-badge public-icon-badge-lg"><MapPin className="h-6 w-6" /></span>
              <h2 className="public-h3 mt-4">Visit us</h2>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
                {entity.physicalAddress}<br />
                {entity.town}{entity.postalCode ? `, P.O. Box ${entity.postalCode}` : ''}<br />
                {entity.county} County, {entity.country}
              </p>
              <a
                className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}
                href={`https://maps.google.com/?q=${encodeURIComponent(`${entity.physicalAddress}, ${entity.town}, ${entity.country}`)}`}
                target="_blank" rel="noopener noreferrer"
              >
                Get directions <ChevronRight className="h-3 w-3" />
              </a>
            </div>

            <div className="public-card public-card-hover public-card-top section-pad">
              <span className="public-icon-badge public-icon-badge-lg"><Phone className="h-6 w-6" /></span>
              <h2 className="public-h3 mt-4">Call us</h2>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
                <a className="font-bold" style={{ color: 'var(--t-primary)' }} href={`tel:${tel}`}>{entity.phone}</a><br />
                {entity.altPhone && <><a className="font-bold" style={{ color: 'var(--t-primary)' }} href={`tel:${entity.altPhone.replace(/\s/g, '')}`}>{entity.altPhone}</a><br /></>}
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Mon–Sat, service hours</span>
              </p>
            </div>

            <div className="public-card public-card-hover public-card-top section-pad">
              <span className="public-icon-badge public-icon-badge-lg"><Mail className="h-6 w-6" /></span>
              <h2 className="public-h3 mt-4">Email us</h2>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
                <a className="font-bold" style={{ color: 'var(--t-primary)' }} href={`mailto:${entity.email}`}>{entity.email}</a><br />
                We respond within one working day.
              </p>
            </div>

            <div className="public-card public-card-hover public-card-top section-pad">
              <span className="public-icon-badge public-icon-badge-lg"><Globe className="h-6 w-6" /></span>
              <h2 className="public-h3 mt-4">Online</h2>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
                <a className="font-bold" style={{ color: 'var(--t-primary)' }} href={entity.website} target="_blank" rel="noopener noreferrer">{entity.website.replace(/^https?:\/\//, '')}</a>
              </p>
              {socials.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {socials.map(([label, href, Icon]) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                       className="grid h-9 w-9 place-items-center rounded-lg transition-transform hover:-translate-y-0.5"
                       style={{ background: 'color-mix(in srgb, var(--t-primary) 12%, transparent)', color: 'var(--t-primary)' }}>
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ MAP + SUBSCRIBE */}
      <section className="public-section-alt py-14 md:py-16">
        <div className="public-container grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--t-border)' }}>
            <iframe
              title={`${entity.name} location map`}
              className="h-[380px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(`${entity.physicalAddress}, ${entity.town}, ${entity.country}`)}&output=embed`}
            />
          </div>
          <div className="public-card section-pad flex flex-col justify-center sm:p-8">
            <span className="public-kicker"><Send className="h-3.5 w-3.5" /> Stay in touch</span>
            <h2 className="public-h2 mt-3 !text-2xl">Get notices &amp; product updates</h2>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
              Subscribe for AGM notices, dividend announcements, new products and member education — straight to your email or phone.
            </p>
            <PublicSubscribeForm />
            <p className="mt-4 flex items-start gap-2 text-[11px]" style={{ color: 'var(--t-muted-text)' }}>
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--t-primary)' }} />
              {entity.name} · Reg {entity.registrationNo}. We never share your details; unsubscribe any time.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
