'use client';
// Digital payments — live transactions log + STK + suspense allocation (guide §14.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Link2, BadgeCheck, QrCode } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtDateTime } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';

export default function PaymentsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [allocateFor, setAllocateFor] = React.useState<any | null>(null);
  const [target, setTarget] = React.useState('');
  const savingsAccounts = useQuery({ queryKey: ['savings-accounts'], queryFn: async () => (await fetch('/api/savings/accounts')).json() });

  const payments = useQuery({ queryKey: ['payments'], queryFn: async () => (await fetch('/api/payments')).json() });

  const allocMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/payments/${payload.id}/allocate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'allocate', target: payload.target, accountId: payload.target === 'SAVINGS_DEPOSIT' ? payload.refId : undefined, loanId: payload.target === 'LOAN_REPAYMENT' ? payload.refId : undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); toast({ title: 'Allocated & posted' }); },
    onError: (e: Error) => toast({ title: 'Allocation failed', description: e.message, variant: 'destructive' }),
  });

  const columns: ColumnSpec<any>[] = [
    { key: 'requestRef', header: 'Reference', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'provider', header: 'Provider', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true },
    { key: 'purpose', header: 'Purpose', type: 'text', defaultVisible: true, filter: 'select' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'receipt', header: 'M-Pesa receipt', type: 'text' },
    { key: 'accountNumber', header: 'Account', type: 'text' },
    { key: 'createdAt', header: 'Initiated', type: 'datetime' },
    { key: 'completedAt', header: 'Completed', type: 'datetime' },
    { key: 'narration', header: 'Narration', type: 'text' },
  ];

  const unallocated = (payments.data ?? []).filter((p: any) => p.purpose === 'UNALLOCATED');

  return (
    <>
      <PageHeader icon={Smartphone} title="Digital Channels" description="M-Pesa Daraja (C2B / STK / B2C) and PesaPal live transactions. Credentials live in Administration → Settings → Integrations." />

      {unallocated.length > 0 && (
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--t-warning)', background: 'color-mix(in srgb, var(--t-warning) 8%, transparent)' }} role="alert">
          <p className="text-sm font-bold" style={{ color: 'var(--t-warning)' }}>
            {unallocated.length} payment(s) in suspense — paybill references we could not identify
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--t-muted-text)' }}>Allocate them to a savings account or loan below.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unallocated.slice(0, 6).map((p: any) => (
              <button key={p.id} className="act-btn act-extra" onClick={() => { setTarget(''); setAllocateFor(p); }}>
                <QrCode className="h-3.5 w-3.5" /> {p.requestRef} · {fmtMoneyPlain(p.amountCents)}
              </button>
            ))}
          </div>
        </div>
      )}

      <DataTable
        id="payments"
        title="Payment transactions"
        subtitle="Unified M-Pesa + PesaPal lifecycle log (INITIATED → PENDING → SUCCESS)"
        data={payments.data ?? []}
        columns={columns}
        searchKeys={['requestRef', 'member', 'receipt', 'phone']}
        exportPermission="payments_view"
        actions={can('payments_allocate') ? [{ label: 'Allocate', icon: Link2, color: 'extra', show: (r: any) => r.purpose === 'UNALLOCATED', onClick: (r: any) => { setTarget(''); setAllocateFor(r); } }] : []}
      />

      <ConfirmDialog
        open={Boolean(allocateFor)}
        onOpenChange={() => setAllocateFor(null)}
        title={`Allocate ${allocateFor ? fmtMoneyPlain(allocateFor.amountCents) : ''}`}
        description="Choose the destination. The posting runs through the same engines as a direct transaction."
        confirmLabel="Allocate & post"
        onConfirm={async () => {
          if (!allocateFor || !target) return;
          await allocMut.mutateAsync({ id: allocateFor.id, target, refId: targetRef() });
        }}
      >
        <div className="space-y-2">
          <div className="flex gap-2">
            <button className={`act-btn act-primary ${target === 'SAVINGS_DEPOSIT' ? '' : 'opacity-60'}`} onClick={() => setTarget('SAVINGS_DEPOSIT')}>Savings deposit</button>
            <button className={`act-btn act-primary ${target === 'LOAN_REPAYMENT' ? '' : 'opacity-60'}`} onClick={() => setTarget('LOAN_REPAYMENT')}>Loan repayment</button>
          </div>
          {target && (
            <select id="alloc-target" className="dsms-input h-10 w-full" aria-label="Destination">
              {target === 'SAVINGS_DEPOSIT'
                ? (savingsAccounts.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.accountNumber} — {a.member}</option>)
                : (payments.data ?? []).length && <option value="pick-loan">Select loan on the table above first (demo)</option>}
            </select>
          )}
        </div>
      </ConfirmDialog>
    </>
  );

  function targetRef(): string {
    return (document.getElementById('alloc-target') as HTMLSelectElement)?.value ?? '';
  }
}
