'use client';
// Member loans — products, apply wizard with EMI preview, status tracker, M-Pesa repay (guide §10.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Smartphone, ChevronRight, CheckCircle2, Clock, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fmtMoneyPlain, fmtBps, fmtDate, badgeClass, statusBadge } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function MemberLoans() {
  const qc = useQueryClient();
  const [applyStep, setApplyStep] = React.useState(0);
  const [productId, setProductId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [term, setTerm] = React.useState(12);
  const [purpose, setPurpose] = React.useState('');
  const [repayFor, setRepayFor] = React.useState<any | null>(null);
  const [phone, setPhone] = React.useState('');
  const [repayAmount, setRepayAmount] = React.useState('');

  const data = useQuery({ queryKey: ['member-loans'], queryFn: async () => (await fetch('/api/member/loans')).json() });

  const applyMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/member/loans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, requestedAmountCents: Math.round(Number((amount || '0').replace(/,/g, '')) * 100), termMonths: term, purpose: purpose || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      return d;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['member-loans'] });
      toast({ title: `Application ${d.applicationNumber} submitted`, description: d.needsGuarantors ? 'Now invite your guarantors from the applications list — they get email + SMS links.' : 'It goes straight to vetting.' });
      setApplyStep(0); setProductId(''); setAmount(''); setTerm(12); setPurpose('');
    },
    onError: (e: Error) => toast({ title: 'Eligibility check failed', description: e.message, variant: 'destructive' }),
  });

  const repayMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payments/stk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amountCents: Math.round(Number((repayAmount || '0').replace(/,/g, '')) * 100), purpose: 'LOAN_REPAYMENT', loanId: repayFor.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      return d;
    },
    onSuccess: (d: any) => {
      toast({ title: 'Repayment prompt sent', description: d.simulated ? 'Demo mode: simulated shortly.' : 'Enter your M-Pesa PIN to complete.' });
      setRepayFor(null);
    },
    onError: (e: Error) => toast({ title: 'Could not send', description: e.message, variant: 'destructive' }),
  });

  const products: any[] = data.data?.products ?? [];
  const applications: any[] = data.data?.applications ?? [];
  const loans: any[] = data.data?.loans ?? [];
  const chosen = products.find((p) => p.id === productId);
  const monthlyRate = chosen ? chosen.interestRateBps / 100 / 12 / 100 / 100 : 0;
  const principal = Number((amount || '0').replace(/,/g, '')) * 100;
  const r = chosen ? chosen.interestRateBps / 100 / 12 / 100 / 100 : 0;
  const n = term;
  const emi = r > 0 && principal > 0 ? Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) : Math.round(principal / n);
  const totalInterest = emi * n - principal;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>My loans</h1>

      {/* apply wizard */}
      <section className="public-card section-pad">
        <h2 className="mb-1 text-sm font-bold">Apply for a loan</h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Prefer the office to handle it? Any staff member can apply on your behalf — you still get every alert.</p>
        {applyStep === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {products.map((p) => (
              <button key={p.id} onClick={() => { setProductId(p.id); setApplyStep(1); }} className="rounded-xl border p-4 text-left" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
                <p className="text-sm font-bold">{p.name}</p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{p.description}</p>
                <p className="mt-2 text-xs">{fmtBps(p.interestRateBps)} {p.interestMethod === 'REDUCING' ? 'reducing' : 'flat'} · up to {p.savingsMultiplier}× savings · {p.requiredGuarantors} guarantor(s)</p>
                <ChevronRight className="mt-1 h-4 w-4" style={{ color: 'var(--t-primary)' }} />
              </button>
            ))}
          </div>
        )}
        {applyStep === 1 && chosen && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">Amount (KES) — max {fmtMoneyPlain(chosen.maxAmountCents)}</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder={fmtMoneyPlain(chosen.minAmountCents)} className="dsms-input h-11" />
                <input type="range" min={chosen.minAmountCents / 100} max={chosen.maxAmountCents / 100} step={1000} value={Number((amount || '0').replace(/,/g, '')) || chosen.minAmountCents / 100}
                       onChange={(e) => setAmount(String(e.target.value))} className="mt-2 w-full" style={{ accentColor: 'var(--t-primary)' }} aria-label="Amount" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Term — {term} months ({chosen.termMinMonths}–{chosen.termMaxMonths})</label>
                <input type="range" min={chosen.termMinMonths} max={chosen.termMaxMonths} value={term} onChange={(e) => setTerm(Number(e.target.value))} className="mt-3 w-full" style={{ accentColor: 'var(--t-primary)' }} aria-label="Term" />
              </div>
            </div>
            {principal > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-primary)', background: 'color-mix(in srgb, var(--t-primary) 6%, transparent)' }}>
                <p className="text-sm">Monthly installment (EMI): <strong style={{ color: 'var(--t-primary)' }}>KES {fmtMoneyPlain(emi)}</strong></p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Total interest over {term} months: KES {fmtMoneyPlain(totalInterest)} · total repayable: KES {fmtMoneyPlain(emi * term)}</p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold">Purpose</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. School fees, business stock" className="dsms-input h-11" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setApplyStep(0)}>Back</Button>
              <Button className="bg-[var(--t-primary)] text-white" disabled={principal < chosen.minAmountCents} onClick={() => applyMut.mutate()}>
                {applyMut.isPending ? 'Submitting…' : 'Submit application'}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* applications tracker */}
      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">My applications</h2>
        {applications.length ? applications.map((a) => (
          <div key={a.id} className="mb-3 rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{a.product} — KES {fmtMoneyPlain(a.requestedAmountCents)}</p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{a.applicationNumber} · applied {fmtDate(a.appliedAt)}</p>
              </div>
              <Badge className={badgeClass[statusBadge(a.status).tone]}>{statusBadge(a.status).label}</Badge>
            </div>
            {a.guarantors.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {a.guarantors.map((g: any) => (
                  <Badge key={g.id} variant="outline">{g.name}: KES {fmtMoneyPlain(g.amountCents)} — {statusBadge(g.status).label}</Badge>
                ))}
              </div>
            )}
            {a.scoreCard && (
              <p className="mt-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>Vetting score: {a.scoreCard.score}/100 · recommendation {a.scoreCard.recommendation}</p>
            )}
          </div>
        )) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No applications yet.</p>}
      </section>

      {/* active loans */}
      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">My loans</h2>
        {loans.length ? loans.map((l) => {
          const nextInstal = l.schedule.find((s: any) => s.paidCents < s.totalDueCents && s.status !== 'WAIVED');
          return (
            <div key={l.id} className="mb-3 rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{l.loanNumber} — {l.product}</p>
                  <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>
                    Outstanding: KES {fmtMoneyPlain(l.outstandingCents)}
                    {nextInstal && <> · next installment KES {fmtMoneyPlain(nextInstal.totalDueCents)} due {fmtDate(nextInstal.dueDate)}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={badgeClass[statusBadge(l.status).tone]}>{statusBadge(l.status).label}</Badge>
                  {l.outstandingCents > 0 && ['ACTIVE', 'OVERDUE'].includes(l.status) && (
                    <Button size="sm" className="bg-[var(--t-primary)] text-white" onClick={() => { setRepayFor(l); setRepayAmount(String(Math.round((nextInstal?.totalDueCents ?? l.outstandingCents) / 100))); }}>
                      <Smartphone className="mr-1 h-3.5 w-3.5" /> Repay
                    </Button>
                  )}
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold" style={{ color: 'var(--t-primary)' }}>Show full amortization schedule</summary>
                <div className="mt-2 dsms-table-wrap">
                  <table className="dsms-table">
                    <thead><tr><th>#</th><th>Due</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
                    <tbody>
                      {l.schedule.map((s: any) => (
                        <tr key={s.id}>
                          <td style={{ textAlign: 'center' }}>{s.installmentNo}</td>
                          <td>{fmtDate(s.dueDate)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.principalDueCents)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.interestDueCents)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.penaltyDueCents)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.totalDueCents)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.paidCents)}</td>
                          <td><Badge variant="outline">{s.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          );
        }) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No loans yet — apply above.</p>}
      </section>

      {repayFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setRepayFor(null)} role="dialog" aria-modal>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="public-card section-pad">
              <h3 className="mb-1 text-sm font-bold">Repay {repayFor.loanNumber} via M-Pesa</h3>
              <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Waterfall allocation: penalties → interest → principal. Receipt alert follows instantly.</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547…" className="dsms-input h-11" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Amount (KES) — outstanding {fmtMoneyPlain(repayFor.outstandingCents)}</label>
                  <input value={repayAmount} onChange={(e) => setRepayAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="dsms-input h-11" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setRepayFor(null)}>Cancel</Button>
                  <Button className="flex-1 bg-[var(--t-primary)] text-white" disabled={!phone || !repayAmount} onClick={() => repayMut.mutate()}>
                    {repayMut.isPending ? 'Sending…' : 'Send prompt'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
