import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApplyWizard } from '@/components/public/ApplyWizard';
import { UserRound, ChevronRight, ShieldCheck, Clock3, FileCheck } from 'lucide-react';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Apply for Membership' };

export default async function ApplyPage() {
  const entity = await getSettings('entity').catch(() => ({ name: 'Divine Sacco' }) as any);

  return (
    <>
      {/* ============================================ PAGE HERO HEADER */}
      <section className="public-page-hero relative isolate">
        <div className="public-hero-grid" />
        <div className="public-hero-blob right-[-8%] top-[-40%] h-80 w-80" style={{ background: 'var(--t-accent)' }} />
        <div className="public-container relative py-12 md:py-16" style={{ color: 'var(--t-card-hero-fg)' }}>
          <nav className="public-breadcrumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <ChevronRight className="h-3 w-3 opacity-70" />
            <span aria-current="page">Apply for membership</span>
          </nav>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
              <UserRound className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold leading-tight md:text-4xl" style={{ fontFamily: 'var(--t-heading-font)' }}>
                Become a member
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed opacity-90">
                Join {entity.name} in five short steps — about 5 minutes. Your application is reviewed within 2 working days,
                and you only need your ID and next of kin details to start.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-semibold opacity-90">
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> 5 minutes to complete</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Reviewed within 2 working days</span>
            <span className="inline-flex items-center gap-1.5"><FileCheck className="h-3.5 w-3.5" /> No paperwork to start</span>
          </div>
        </div>
      </section>

      {/* ============================================ WIZARD (full width) */}
      <section className="py-10 md:py-14" style={{ background: 'var(--t-bg)' }}>
        <div className="public-container">
          <Suspense fallback={<div className="public-card section-pad mx-auto max-w-2xl">Loading wizard…</div>}>
            <ApplyWizard />
          </Suspense>
        </div>
      </section>
    </>
  );
}
