'use client';
// ============================================================================
// Public loan calculator — hero section (inspired by hazinasacco.or.ke).
// Math mirrors the REAL engine (src/lib/loans/service.ts buildSchedule) so the
// numbers shown to the public match what members actually pay:
//   REDUCING → annuity EMI   |   FLAT → equal monthly installments.
// Products come live from /api/public/brand (loan products configuration).
// ============================================================================
import * as React from 'react';
import { Calculator, ChevronDown } from 'lucide-react';

export interface CalcLoanProduct {
  id: string; code: string; name: string;
  interestMethod: string; interestRateBps: number;
  termMinMonths: number; termMaxMonths: number;
  minAmountCents: number; maxAmountCents: number;
  savingsMultiplier: number; requiredGuarantors: number;
  description: string | null;
}

const kes = (cents: number) =>
  'KES ' + (cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 });

/** Monthly rate in cents-math, same as engine bpsToMonthly. */
function monthlyRate(bps: number): number {
  return bps / 100 / 12 / 100; // fraction per month
}

/** Annuity EMI — same formula family as the engine (integer-safe here for display). */
function annuityEmi(principalCents: number, rMonthly: number, n: number): number {
  if (rMonthly <= 0) return Math.round(principalCents / n);
  const f = Math.pow(1 + rMonthly, n);
  return Math.round((principalCents * rMonthly * f) / (f - 1));
}

export function LoanCalculator({ products }: { products: CalcLoanProduct[] }) {
  const [productCode, setProductCode] = React.useState(products[0]?.code ?? '');
  const product = products.find((p) => p.code === productCode) ?? products[0];

  const minAmt = product ? product.minAmountCents / 100 : 5_000;
  const maxAmt = product ? product.maxAmountCents / 100 : 1_000_000;
  const [amount, setAmount] = React.useState<number>(Math.min(150_000, Math.max(minAmt, 50_000)));
  const [months, setMonths] = React.useState<number>(product ? Math.min(24, product.termMaxMonths) : 24);
  const [touchedAmount, setTouchedAmount] = React.useState(false);
  const [touchedMonths, setTouchedMonths] = React.useState(false);

  // keep amount/months inside the selected product's envelope
  React.useEffect(() => {
    if (!product) return;
    setAmount((a) => Math.min(Math.max(a, product.minAmountCents / 100), product.maxAmountCents / 100));
    setMonths((m) => Math.min(Math.max(m, product.termMinMonths), product.termMaxMonths));
  }, [productCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) {
    return (
      <div className="public-calc p-6 text-sm" style={{ color: 'var(--t-muted-text)' }}>
        Loan products are being configured — the calculator will appear here shortly.
      </div>
    );
  }

  const r = monthlyRate(product.interestRateBps);
  const n = months;
  const principalCents = Math.round(amount * 100);

  let monthlyCents: number;
  let totalCents: number;
  if (product.interestMethod === 'FLAT') {
    const totalInterest = Math.round((principalCents * (product.interestRateBps / 100) * n) / 12 / 100);
    monthlyCents = Math.round((principalCents + totalInterest) / n);
    totalCents = principalCents + totalInterest;
  } else {
    monthlyCents = annuityEmi(principalCents, r, n);
    totalCents = monthlyCents * n;
  }
  const totalInterest = totalCents - principalCents;

  return (
    <div className="public-calc" aria-label="Loan calculator">
      {/* header */}
      <div className="public-calc-header flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
            <Calculator className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
          </span>
          <div>
            <p className="text-sm font-extrabold">Loan calculator</p>
            <p className="text-[11px] opacity-80">Live from our loan products — no surprises</p>
          </div>
        </div>
        <span className="public-calc-tab hidden sm:inline-flex">{product.interestMethod === 'FLAT' ? 'Flat rate' : 'Reducing balance'}</span>
      </div>

      {/* body */}
      <div className="grid gap-5 p-5 md:grid-cols-[1.15fr_1fr] md:gap-6 md:p-6">
        <div className="space-y-4">
          {/* product */}
          <div>
            <label htmlFor="lc-product" className="mb-1 block text-xs font-bold" style={{ color: 'var(--t-muted-text)' }}>
              Loan product
            </label>
            <div className="relative">
              <select
                id="lc-product"
                value={productCode}
                onChange={(e) => {
                  setProductCode(e.target.value);
                  setTouchedAmount(false);
                  setTouchedMonths(false);
                }}
                className="dsms-input h-11 w-full appearance-none pr-9 font-semibold"
              >
                {products.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} — {(p.interestRateBps / 100).toFixed(1)}% p.m.
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            </div>
            {product.description && (
              <p className="mt-1.5 line-clamp-2 text-[11px]" style={{ color: 'var(--t-muted-text)' }}>{product.description}</p>
            )}
          </div>

          {/* amount */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label htmlFor="lc-amount" className="text-xs font-bold" style={{ color: 'var(--t-muted-text)' }}>Amount (KES)</label>
              <span className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--t-primary)' }}>
                {amount.toLocaleString('en-KE')}
              </span>
            </div>
            <input
              id="lc-amount" type="range" min={minAmt} max={maxAmt} step={1000}
              value={amount}
              onChange={(e) => { setTouchedAmount(true); setAmount(Number(e.target.value)); }}
              className="public-calc-slider mt-1 w-full"
              aria-valuetext={`KES ${amount.toLocaleString()}`}
            />
            <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--t-muted-text)' }}>
              <span>min {kes(product.minAmountCents)}</span>
              <span>max {kes(product.maxAmountCents)}</span>
            </div>
          </div>

          {/* term */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label htmlFor="lc-months" className="text-xs font-bold" style={{ color: 'var(--t-muted-text)' }}>Repayment period</label>
              <span className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--t-primary)' }}>
                {months} month{months > 1 ? 's' : ''}
              </span>
            </div>
            <input
              id="lc-months" type="range" min={product.termMinMonths} max={product.termMaxMonths} step={1}
              value={months}
              onChange={(e) => { setTouchedMonths(true); setMonths(Number(e.target.value)); }}
              className="public-calc-slider mt-1 w-full"
            />
            <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--t-muted-text)' }}>
              <span>{product.termMinMonths} mo</span>
              <span>{product.termMaxMonths} mo</span>
            </div>
          </div>

          <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--t-muted-text)' }}>
            Up to <strong>{product.savingsMultiplier}× your savings</strong> · {product.requiredGuarantors === 0 ? 'no guarantors' : `${product.requiredGuarantors} guarantor${product.requiredGuarantors > 1 ? 's' : ''}`} ·
            {' '}processing &amp; insurance fees per product terms. Estimate{product.interestMethod === 'FLAT' ? '' : ' on reducing balance'}.
          </p>
        </div>

        {/* output */}
        <div className="public-calc-output flex flex-col justify-between gap-4 rounded-xl p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Monthly installment</p>
            <p className="mt-1 text-3xl font-black tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>
              {kes(monthlyCents)}
            </p>
            <p className="mt-1 text-[11px] opacity-80">for {months} months · {(product.interestRateBps / 100).toFixed(1)}% per month</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[11.5px]">
            <div className="rounded-lg bg-white/12 px-3 py-2.5">
              <dt className="opacity-80">Total interest</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums">{kes(totalInterest)}</dd>
            </div>
            <div className="rounded-lg bg-white/12 px-3 py-2.5">
              <dt className="opacity-80">Total repayable</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums">{kes(totalCents)}</dd>
            </div>
          </dl>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href="/apply" className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-xs font-extrabold transition-transform hover:-translate-y-0.5" style={{ color: 'var(--t-primary)' }}>
              Apply for this loan
            </a>
            <a href="/#products" className="inline-flex items-center justify-center rounded-full border border-white/45 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/10">
              Compare products
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
