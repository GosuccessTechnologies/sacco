'use client';
// Member shares + dividends history (guide §11.6).
import * as React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { TrendingUp, Coins } from 'lucide-react';
import { fmtMoneyPlain, fmtDate, badgeClass, statusBadge } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export default function MemberShares() {
  const shares = useQuery({ queryKey: ['member-shares'], queryFn: async () => (await fetch('/api/member/shares')).json() });
  const [qty, setQty] = React.useState('10');

  const buy = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/member/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: Number(qty) || 1 }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      return d;
    },
    onSuccess: () => { toast({ title: 'Share purchase posted' }); shares.refetch(); },
    onError: (e: Error) => toast({ title: 'Purchase failed', description: e.message, variant: 'destructive' }),
  });

  const d = shares.data;
  if (shares.isLoading || !d) return <div className="public-card h-40 animate-pulse" />;
  const meetsMin = d.position.totalShares >= d.config.minShares;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>My shares & dividends</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="public-card section-pad">
          <TrendingUp className="mb-2 h-6 w-6" style={{ color: 'var(--t-primary)' }} />
          <p className="text-2xl font-black tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>{d.position.totalShares}</p>
          <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>shares held · worth KES {fmtMoneyPlain(d.position.totalValueCents)}</p>
          <Badge className={meetsMin ? badgeClass.success : badgeClass.warning}>{meetsMin ? `meets minimum (${d.config.minShares})` : `minimum is ${d.config.minShares}`}</Badge>
        </div>
        <div className="public-card section-pad">
          <Coins className="mb-2 h-6 w-6" style={{ color: 'var(--t-accent)' }} />
          <p className="text-sm font-bold">Buy more shares</p>
          <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Nominal value KES {fmtMoneyPlain(d.config.nominalValueCents)} per share. Purchase from savings or at the counter.</p>
          <div className="mt-3 flex gap-2">
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className="dsms-input h-10 w-24" aria-label="Quantity" />
            <Button size="sm" className="bg-[var(--t-primary)] text-white" onClick={() => buy.mutate()} disabled={buy.isPending}>
              {buy.isPending ? 'Posting…' : `Buy ${qty || 0} (KES ${fmtMoneyPlain((Number(qty) || 0) * d.config.nominalValueCents)})`}
            </Button>
          </div>
        </div>
      </div>

      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">Dividend history</h2>
        {(d.dividends ?? []).length ? (
          <div className="dsms-table-wrap">
            <table className="dsms-table">
              <thead><tr><th>Year</th><th>Shares held</th><th>Share dividend</th><th>Deposit interest</th><th>Total payout</th><th>Channel</th><th>Paid</th><th>Run</th></tr></thead>
              <tbody>
                {d.dividends.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.year}</td>
                    <td style={{ textAlign: 'right' }}>{e.sharesHeld}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.shareDividendCents)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.depositInterestCents)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyPlain(e.totalPayoutCents)}</td>
                    <td>{e.payoutChannel.replace(/_/g, ' ').toLowerCase()}</td>
                    <td>{e.paidAt ? fmtDate(e.paidAt) : '—'}</td>
                    <td><Badge variant="outline">{statusBadge(e.runStatus).label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No dividends yet — the board declares annually.</p>}
      </section>

      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">Share transactions</h2>
        <div className="dsms-table-wrap">
          <table className="dsms-table">
            <thead><tr><th>Certificate</th><th>Type</th><th>Shares</th><th>Amount</th><th>Channel</th><th>Date</th></tr></thead>
            <tbody>
              {(d.transactions ?? []).map((t: any) => (
                <tr key={t.id}>
                  <td>{t.certificateRef || '—'}</td>
                  <td><Badge variant="outline">{t.type}</Badge></td>
                  <td style={{ textAlign: 'right' }}>{t.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(t.amountCents)}</td>
                  <td>{t.channel}</td>
                  <td>{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
              {!(d.transactions ?? []).length && <tr><td colSpan={6} className="py-6 text-center text-sm" style={{ color: 'var(--t-muted-text)' }}>No share transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

