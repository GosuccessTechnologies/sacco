// ============================================================================
// DSMS money engine — DEVELOPER_GUIDE.md §4.2
// All amounts: integer minor units (cents). Rates: basis points (bps).
// ============================================================================

/** Parse user input like "1,250.50" → 125050 cents. Rejects >2 decimals / negative. */
export function parseMoney(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error('Invalid amount');
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[KES\s,]/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`Invalid amount: "${input}"`);
  const [whole, dec = ''] = cleaned.split('.');
  const cents = parseInt(whole, 10) * 100 + parseInt((dec + '00').slice(0, 2), 10);
  return cents;
}

/** 125050 → "KES 1,250.50" */
export function fmtMoney(cents: number, currency = 'KES'): string {
  const neg = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString();
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${neg}${currency} ${grouped}.${dec}`;
}

/** 125050 → "1,250.50" (inputs, no currency) */
export function fmtMoneyPlain(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole}.${dec}`;
}

/** bps → decimal monthly rate string for display */
export function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** round half-up to cent */
export function roundMoney(x: number): number {
  return Math.round(x);
}

/** Banker's rounding (half-even) — used for interest true-ups */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Annuity EMI in integer cents. r = monthly decimal rate. */
export function emiCents(principalCents: number, monthlyRate: number, n: number): number {
  if (n <= 0) throw new Error('term must be > 0');
  if (monthlyRate <= 0) return Math.round(principalCents / n);
  const pow = Math.pow(1 + monthlyRate, n);
  const emi = (principalCents * monthlyRate * pow) / (pow - 1);
  return roundMoney(emi);
}

/** EMI as full-precision float for display sanity checks */
export function emiPrecise(principalCents: number, monthlyRate: number, n: number): number {
  const pow = Math.pow(1 + monthlyRate, n);
  return (principalCents * monthlyRate * pow) / (pow - 1);
}

export const bpsToMonthly = (bps: number): number => (bps / 100) / 12;
