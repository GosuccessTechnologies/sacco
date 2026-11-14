'use client';
// Member savings — accounts, statements, M-Pesa deposit (guide §10.6/§12.2.3 portal).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Smartphone } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fmtMoneyPlain, fmtDate } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function MemberSavings() {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [stkOpen, setStkOpen] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [amount, setAmount] = React.useState('');

  const accounts = useQuery({ queryKey: ['member-accounts'], queryFn: async () => (await fetch('/api/member/savings?want=accounts')).json() });
  const txns = useQuery({
    queryKey: ['member-txns', selected],
    queryFn: async () => (await fetch(`/api/member/savings?want=transactions${selected ? `&accountId=${selected}` : ''}`)).json(),
  });
  const profile = useQuery({ queryKey: ['member-profile'], queryFn: async () => (await fetch('/api/member/profile')).json() });

  const stkMut = useMutation({
    mutationFn: async () => {
      const acct = (accounts.data ?? []).find((a: any) => a.id === selected) ?? (accounts.data ?? [])[0];
      const res = await fetch('/api/payments/stk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amountCents: Math.round(Number((amount || '0').replace(/,/g, '')) * 100), purpose: 'SAVINGS_DEPOSIT', accountId: acct?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (d: any) => {
      toast({ title: 'STK push sent', description: d.simulated ? 'Demo mode: confirmation simulated shortly.' : 'Check your phone and enter your M-Pesa PIN.' });
      setStkOpen(false);
      setTimeout(() => qc.invalidateQueries({ queryKey: ['member-accounts'] }), 4000);
    },
    onError: (e: Error) => toast({ title: 'Could not send push', description: e.message, variant: 'destructive' }),
  });

  const rows = (txns.data ?? []) as any[];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>My savings</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {(accounts.data ?? []).map((a: any) => (
          <button key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                  className="public-card p-4 text-left" style={{ borderColor: selected === a.id ? 'var(--t-primary)' : 'var(--t-border)', borderWidth: selected === a.id ? 2 : 1 }}>
            <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{a.product} · {a.accountNumber}</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>KES {fmtMoneyPlain(a.balanceCents)}</p>
            <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>
              Interest earned: KES {fmtMoneyPlain(a.interestEarnedCents)}
              {a.heldFundsCents > 0 && <> · hold: KES {fmtMoneyPlain(a.heldFundsCents)}</>}
            </p>
            <Badge className="mt-2" variant="outline">{a.status}</Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 no-print">
        <Button size="sm" className="bg-[var(--t-primary)] text-white" onClick={() => { setPhone(profile.data?.phone ?? ''); setAmount(''); setStkOpen(true); }}>
          <Smartphone className="mr-1 h-3.5 w-3.5" /> Deposit via M-Pesa
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1 h-3.5 w-3.5" /> Print statement
        </Button>
      </div>

      <section className="public-card section-pad print-area">
        <div className="mb-3 flex items-center justify-between no-print">
          <h2 className="text-sm font-bold">{selected ? `Statement — ${(accounts.data ?? []).find((a: any) => a.id === selected)?.accountNumber}` : 'All transactions'}</h2>
          {selected && <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Show all</Button>}
        </div>
        <div className="dsms-table-wrap">
          <table className="dsms-table">
            <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Channel</th><th>Narration</th><th>Amount</th><th>Balance</th><th>Ref</th></tr></thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{fmtDate(t.valueDate)}</td>
                  <td><Badge variant="outline">{t.type}</Badge></td>
                  <td>{t.channel}</td>
                  <td className="max-w-40 truncate">{t.narration}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoneyPlain(t.amountCents)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(t.balanceAfterCents)}</td>
                  <td className="text-xs">{t.externalRef || t.reference}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="py-8 text-center text-sm" style={{ color: 'var(--t-muted-text)' }}>No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {stkOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setStkOpen(false)} role="dialog" aria-modal>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="public-card section-pad">
              <h3 className="mb-1 text-sm font-bold">Deposit via M-Pesa (STK push)</h3>
              <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>The prompt arrives on your phone — enter your PIN and the deposit posts automatically with a confirmation alert.</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Phone number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547…" className="dsms-input h-11" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Amount (KES)</label>
                  <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="5,000.00" className="dsms-input h-11" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStkOpen(false)}>Cancel</Button>
                  <Button className="flex-1 bg-[var(--t-primary)] text-white" disabled={!phone || !amount} onClick={() => stkMut.mutate()}>
                    {stkMut.isPending ? 'Sending…' : 'Send prompt'}
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
