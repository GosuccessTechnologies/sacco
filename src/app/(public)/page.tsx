// ============================================================================
// Landing page — premium full-width overhaul (Instr 3).
// Inspiration: stima-sacco.com, unsacco.org, zoghorisacco.com,
// hazinasacco.or.ke (loan calculator in hero), nationsacco.com.
// Everything from the database (guide §18.2). Stat cards REMOVED per Instr 3.
// Sections span edge-to-edge; inner content uses .public-container.
// ============================================================================
import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Landmark, PiggyBank, Percent, Smartphone, Users,
  ShieldCheck, HandCoins, TrendingUp, Wallet, GraduationCap, Store, Wrench,
  QrCode, PhoneCall, FileCheck, UserPlus, Award, Clock3, Quote, MapPin,
} from 'lucide-react';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fileUrl } from '@/lib/files';
import { decryptJson } from '@/lib/core-utils';
import { fmtBps, fmtMoneyPlain } from '@/lib/money';
import { LoanCalculator, type CalcLoanProduct } from '@/components/public/LoanCalculator';

export const revalidate = 60;

export default async function LandingPage() {
  const [sections, savings, loans, entity, socialRow] = await Promise.all([
    db.pageContent.findMany({ where: { page: 'home', visible: true }, orderBy: { sortOrder: 'asc' } }).catch(() => []),
    db.savingsProduct.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: 'asc' } }).catch(() => []),
    db.loanProduct.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: 'asc' } }).catch(() => []),
    getSettings('entity').catch(() => ({ phone: '+254700123456' }) as any),
    db.integrationCredential.findUnique({ where: { provider: 'SOCIAL' } }).catch(() => null),
  ]);

  const sec = (name: string) => sections.find((s) => s.section === name);
  const hero = sec('hero');
  const about = sec('about');
  const why = sec('why');
  const testimonials = sec('testimonials');
  const cta = sec('cta');
  const media = sec('media');

  let youtube: string | null = null;
  if (socialRow?.config) {
    try { youtube = (decryptJson<Record<string, string>>(socialRow.config as unknown as string)).youtube ?? null; } catch { /* not set */ }
  }
  const heroImage = hero?.imageFileId ? await db.fileRecord.findUnique({ where: { id: hero.imageFileId } }).catch(() => null) : null;

  const calcProducts: CalcLoanProduct[] = loans.map((p) => ({
    id: p.id, code: p.code, name: p.name, interestMethod: p.interestMethod,
    interestRateBps: p.interestRateBps, termMinMonths: p.termMinMonths, termMaxMonths: p.termMaxMonths,
    minAmountCents: p.minAmountCents, maxAmountCents: p.maxAmountCents,
    savingsMultiplier: p.savingsMultiplier, requiredGuarantors: p.requiredGuarantors, description: p.description,
  }));

  // map product codes to purpose icons ("borrow by purpose" pattern)
  const purposeIcon = (code: string) => {
    const c = code.toUpperCase();
    if (c.includes('DEV')) return Landmark;
    if (c.includes('EMER')) return Wrench;
    if (c.includes('SCH')) return GraduationCap;
    if (c.includes('BIZ')) return Store;
    if (c.includes('SCH')) return GraduationCap;
    return HandCoins;
  };

  const joinSteps = [
    { icon: UserPlus, title: 'Apply online', desc: 'Fill the 5-step form in about 5 minutes — ID and next of kin details is all you need.' },
    { icon: FileCheck, title: 'Verification', desc: 'Our team reviews and verifies your details within 2 working days.' },
    { icon: BadgeCheck, title: 'Pay shares & open', desc: 'Pay the minimum share capital and open your Main Savings account.' },
    { icon: TrendingUp, title: 'Save & borrow', desc: 'Grow your savings and unlock loans of up to 3× (product dependent) your deposits.' },
  ];

  const digitalChannels = [
    { icon: Smartphone, title: 'Member app (PWA)', desc: 'Install the Divine Sacco app from your dashboard — balances, statements, loan applications and M-Pesa repayments.' },
    { icon: QrCode, title: 'M-Pesa paybill', desc: 'Deposit or repay instantly via M-Pesa — STK push posts to your account in seconds.' },
    { icon: PhoneCall, title: 'USSD & office', desc: `Visit any branch or call ${entity.phone} — tellers, reception and loans desks are ready to help.` },
  ];

  const tickerItems = [
    `Dividend on shares every year`,
    `Loans from ${fmtBps(loans.length ? Math.min(...loans.map((l) => l.interestRateBps)) : 600)} per month`,
    `Save from any amount — no minimum monthly deposit`,
    `Regulated by SASRA · Reg ${entity.registrationNo}`,
    `Member-owned · Audited annually`,
    `M-Pesa deposits & repayments`,
  ];

  return (
    <>
      {/* ================================================= HERO + LOAN CALCULATOR */}
      <section className="public-hero relative isolate">
        <div className="public-hero-grid" />
        <div className="public-hero-blob left-[-10%] top-[-20%] h-96 w-96" style={{ background: 'var(--t-accent)' }} />
        <div className="public-hero-blob right-[-5%] bottom-[-30%] h-[28rem] w-[28rem]" style={{ background: 'var(--t-info)' }} />
        <div className="public-container relative grid gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
          <div className="text-[color:var(--t-card-hero-fg)]">
            <span className="public-breadcrumb !border-white/25 !bg-white/10">
              {hero?.subtitle ?? `${entity.name} · Licensed · Audited`}
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-extrabold leading-[1.08] sm:text-4xl lg:text-[3.4rem]" style={{ fontFamily: 'var(--t-heading-font)' }}>
              {hero?.title ?? 'Grow Your Money With People You Trust'}
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed opacity-90 sm:text-base">
              {hero?.body ?? 'Save conveniently, borrow affordably, and earn annual dividends.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={hero?.ctaHref ?? '/apply'} className="public-btn-primary">
                {hero?.ctaLabel ?? 'Become a member'} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/#calculator" className="public-btn-ghost">Estimate a loan</Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/20 pt-6">
              {[
                { icon: ShieldCheck, label: 'SASRA regulated' },
                { icon: Users, label: 'Member owned' },
                { icon: Award, label: 'Annual dividends' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-[11.5px] font-semibold opacity-90">
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </div>
              ))}
            </div>
          </div>

          {/* calculator card (Hazina pattern) */}
          <div id="calculator" className="scroll-mt-28">
            {heroImage ? (
              <div className="mb-5 overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                <img src={fileUrl(heroImage)} alt={`${entity.name} members`} className="h-44 w-full object-cover" />
              </div>
            ) : null}
            <LoanCalculator products={calcProducts} />
          </div>
        </div>
      </section>

      {/* ================================================= TICKER */}
      <div className="public-ticker py-2.5" aria-hidden>
        <div className="public-ticker-track text-[12px] font-semibold tracking-wide">
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} className="mx-6 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--t-accent)' }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ================================================= PRODUCTS — savings */}
      <section id="products" className="scroll-mt-24 py-16 md:py-20" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container">
          <div className="max-w-2xl">
            <span className="public-kicker"><PiggyBank className="h-3.5 w-3.5" /> Savings that work hard</span>
            <h2 className="public-h2 mt-3">Savings accounts for every goal</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
              Live product terms — exactly what members get today. Open any account when you join or from your member portal.
            </p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {savings.map((p) => (
              <div key={p.id} className="public-card public-card-hover public-card-top section-pad flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="public-h3">{p.name}</h3>
                  {p.interestRateBps > 0 && <span className="public-chip shrink-0">{fmtBps(p.interestRateBps)} p.a.</span>}
                </div>
                <p className="mt-2 grow text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>{p.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--t-border)' }}>
                  <div><dt className="opacity-70">Min opening</dt><dd className="mt-0.5 font-bold">KES {fmtMoneyPlain(p.minOpeningCents)}</dd></div>
                  <div><dt className="opacity-70">Min balance</dt><dd className="mt-0.5 font-bold">KES {fmtMoneyPlain(p.minBalanceCents)}</dd></div>
                </dl>
                <Link href={`/apply?product=${p.code}`} className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
                  Open this account <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================= PRODUCTS — loans (borrow by purpose) */}
      <section className="public-section-alt py-16 md:py-20">
        <div className="public-container">
          <div className="max-w-2xl">
            <span className="public-kicker"><HandCoins className="h-3.5 w-3.5" /> Borrow by purpose</span>
            <h2 className="public-h2 mt-3">What do you need money for?</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
              Choose a purpose, see the live rates, then estimate your repayment with the calculator above.
            </p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loans.map((p) => {
              const Icon = purposeIcon(p.code);
              return (
                <div key={p.id} className="public-card public-card-hover section-pad flex flex-col">
                  <span className="public-icon-badge"><Icon className="h-5 w-5" /></span>
                  <h3 className="public-h3 mt-4">{p.name}</h3>
                  <p className="mt-1.5 grow text-xs leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>{p.description}</p>
                  <dl className="mt-4 space-y-1.5 border-t pt-3 text-xs" style={{ borderColor: 'var(--t-border)' }}>
                    <div className="flex items-center justify-between"><dt className="inline-flex items-center gap-1 opacity-70"><Percent className="h-3 w-3" /> Rate</dt><dd className="font-bold">{fmtBps(p.interestRateBps)} p.m.</dd></div>
                    <div className="flex items-center justify-between"><dt className="inline-flex items-center gap-1 opacity-70"><Wallet className="h-3 w-3" /> Up to</dt><dd className="font-bold">{p.savingsMultiplier}× savings</dd></div>
                    <div className="flex items-center justify-between"><dt className="inline-flex items-center gap-1 opacity-70"><Clock3 className="h-3 w-3" /> Term</dt><dd className="font-bold">{p.termMinMonths}–{p.termMaxMonths} mo</dd></div>
                    <div className="flex items-center justify-between"><dt className="inline-flex items-center gap-1 opacity-70"><Users className="h-3 w-3" /> Guarantors</dt><dd className="font-bold">{p.requiredGuarantors}</dd></div>
                  </dl>
                  <Link href="/apply" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--t-primary)' }}>
                    Apply <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================= ABOUT */}
      <section id="about" className="scroll-mt-24 py-16 md:py-20" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <span className="public-kicker"><Users className="h-3.5 w-3.5" /> About us</span>
            <h2 className="public-h2 mt-3">{about?.title ?? 'Who We Are'}</h2>
            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--t-primary)' }}>{about?.subtitle}</p>
            <div className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}
                 dangerouslySetInnerHTML={{ __html: about?.body ?? '' }} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/apply" className="public-btn-dark !py-2.5 text-sm">Join the society <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/contact" className="public-btn-ghost !py-2.5 text-sm">Visit our offices</Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, title: 'Regulated & audited', desc: `Licensed co-operative supervised by SASRA. Reg ${entity.registrationNo}.` },
              { icon: TrendingUp, title: 'Annual dividends', desc: 'Surplus is shared with members — your savings earn on top of interest on deposits.' },
              { icon: Smartphone, title: 'Digital-first', desc: 'PWA member app, M-Pesa deposits and repayments, e-statements on demand.' },
              { icon: Users, title: 'Member owned', desc: 'One member one share — decisions at the AGM, surplus back to members.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="public-card public-tint section-pad">
                <span className="public-icon-badge"><Icon className="h-5 w-5" /></span>
                <h3 className="public-h3 mt-3.5">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================= WHY US */}
      <section id="why" className="public-section-alt scroll-mt-24 py-16 md:py-20">
        <div className="public-container">
          <div className="mx-auto max-w-2xl text-center">
            <span className="public-kicker justify-center"><BadgeCheck className="h-3.5 w-3.5" /> {why?.subtitle ?? 'Built for members, by members'}</span>
            <h2 className="public-h2 mt-3">{why?.title ?? 'Why Members Choose Us'}</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(why?.body ?? '').split(';').filter(Boolean).map((point, i) => {
              const icons = [PiggyBank, Percent, Landmark, Smartphone, BadgeCheck, Users, ShieldCheck, TrendingUp];
              const Icon = icons[i % icons.length];
              return (
                <div key={i} className="public-card public-card-hover section-pad flex items-start gap-3.5">
                  <span className="public-icon-badge"><Icon className="h-5 w-5" /></span>
                  <p className="text-[13px] font-semibold leading-snug">{point.trim()}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================= DIGITAL CHANNELS */}
      <section className="py-16 md:py-20" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container">
          <div className="max-w-2xl">
            <span className="public-kicker"><Smartphone className="h-3.5 w-3.5" /> Bank from anywhere</span>
            <h2 className="public-h2 mt-3">Your money, wherever you are</h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {digitalChannels.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="public-card public-card-hover section-pad">
                <span className="public-icon-badge public-icon-badge-lg"><Icon className="h-6 w-6" /></span>
                <h3 className="public-h3 mt-4">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================= JOIN IN 4 STEPS */}
      <section className="public-section-alt py-16 md:py-20">
        <div className="public-container">
          <div className="mx-auto max-w-2xl text-center">
            <span className="public-kicker justify-center"><UserPlus className="h-3.5 w-3.5" /> Membership</span>
            <h2 className="public-h2 mt-3">Join in four simple steps</h2>
            <p className="mt-3 text-sm" style={{ color: 'var(--t-muted-text)' }}>Application reviewed within 2 working days · terms apply</p>
          </div>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {joinSteps.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="public-card section-pad h-full">
                  <div className="flex items-center gap-3">
                    <span className="public-step-no">{i + 1}</span>
                    <s.icon className="h-5 w-5" style={{ color: 'var(--t-primary)' }} />
                  </div>
                  <h3 className="public-h3 mt-4">{s.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>{s.desc}</p>
                </div>
                {i < joinSteps.length - 1 && (
                  <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 lg:block" style={{ color: 'var(--t-primary)' }} />
                )}
              </li>
            ))}
          </ol>
          <div className="mt-8 text-center">
            <Link href="/apply" className="public-btn-primary">Start your application <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      {/* ================================================= TESTIMONIALS */}
      <section id="testimonials" className="scroll-mt-24 py-16 md:py-20" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container">
          <div className="mx-auto max-w-2xl text-center">
            <span className="public-kicker justify-center"><Quote className="h-3.5 w-3.5" /> {testimonials?.subtitle ?? 'Real stories'}</span>
            <h2 className="public-h2 mt-3">{testimonials?.title ?? 'Members Say It Best'}</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {(testimonials?.body ?? '').split(';').filter(Boolean).map((t, i) => (
              <blockquote key={i} className="public-card public-card-hover section-pad">
                <Quote className="h-6 w-6 opacity-20" />
                <p className="mt-2 text-[13px] leading-relaxed">“{t.trim()}”</p>
                <footer className="mt-4 flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--t-primary)' }}>
                  <span className="grid h-7 w-7 place-items-center rounded-full text-[10px] text-white" style={{ background: 'var(--t-primary)' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  — {entity.name} member
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================= MEDIA / NEWS */}
      <section id="media" className="public-section-alt scroll-mt-24 py-16 md:py-20">
        <div className="public-container">
          <div className="max-w-2xl">
            <span className="public-kicker"><Landmark className="h-3.5 w-3.5" /> {media?.subtitle ?? 'From our channels'}</span>
            <h2 className="public-h2 mt-3">{media?.title ?? 'See Us In Action'}</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
              {media?.body ?? 'Follow our social channels (links in the top bar and footer) for member education, AGM highlights and product launches.'}
            </p>
          </div>
          {youtube ? (
            <div className="mt-8 aspect-video max-w-3xl overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--t-border)' }}>
              <iframe
                src={`https://www.youtube.com/embed?listType=user_uploads&list=${encodeURIComponent(youtube.replace(/.*@/, '@'))}`}
                title={`${entity.name} on YouTube`}
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {['AGM highlights & notices', 'Member education series', 'Product launches'].map((t) => (
                <div key={t} className="public-card section-pad flex items-center gap-3">
                  <span className="public-icon-badge"><Smartphone className="h-5 w-5" /></span>
                  <p className="text-[13px] font-semibold">{t}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================================================= CTA BAND */}
      <section className="public-hero relative isolate">
        <div className="public-hero-grid" />
        <div className="public-container relative py-16 text-center md:py-20">
          <h2 className="public-h2 !text-[color:var(--t-card-hero-fg)]">{cta?.title ?? 'Ready to grow with us?'}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed opacity-90">{cta?.body ?? cta?.subtitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={cta?.ctaHref ?? '/apply'} className="public-btn-primary">{cta?.ctaLabel ?? 'Apply Now'} <ArrowRight className="h-4 w-4" /></Link>
            <a href={`tel:${entity.phone.replace(/[\s]/g, '')}`} className="public-btn-ghost">Talk to us first</a>
            <Link href="/contact" className="public-btn-ghost"><MapPin className="h-4 w-4" /> Find our offices</Link>
          </div>
        </div>
      </section>
    </>
  );
}
