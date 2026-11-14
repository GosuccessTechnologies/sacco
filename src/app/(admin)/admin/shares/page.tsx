'use client';
// Shares & dividends — ledger, positions, dividend runs wizard (guide §11.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Coins, ArrowLeftRight, Sparkles, CheckCircle2, Banknote, Play, ThumbsUp, Send } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtDate, fmtBps, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SharesPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = React.useState('ledger');
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [runOpen, setRunOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ id: string; kind: 'compute' | 'approve' | 'pay'; label: string } | null>(null);
  const [entriesFor, setEntriesFor] = React.useState<string | null>(null);

  const ledger = useQuery({ queryKey: ['shares'], queryFn: async () => (await fetch('/api/shares')).json() });
  const positions = useQuery({ queryKey: ['share-positions'], queryFn: async () => (await fetch('/api/shares/positions')).json() });
  const runs = useQuery({ queryKey: ['dividend-runs'], queryFn: async () => (await fetch('/api/dividends/runs')).json() });
  const members = useQuery({ queryKey: ['members'], queryFn: async () => (await fetch('/api/members')).json() });
  const savingsAccounts = useQuery({ queryKey: ['savings-accounts'], queryFn: async () => (await fetch('/api/savings/accounts')).json() });
  const entries = useQuery({
    queryKey: ['dividend-entries', entriesFor],
    queryFn: async () => (await fetch(`/api/dividends/runs/${entriesFor}/compute`)).json(),
    enabled: Boolean(entriesFor),
  });

  const shareMut = useMutation({
    mutationFn: async ({ endpoint, payload }: { endpoint: string; payload: any }) => {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares'] });
      qc.invalidateQueries({ queryKey: ['share-positions'] });
      toast({ title: 'Share transaction posted' });
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const runMut = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: string }) => {
      const res = await fetch(`/api/dividends/runs/${id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any, vars) => {
      qc.invalidateQueries({ queryKey: ['dividend-runs'] });
      if (vars.kind === 'compute') toast({ title: `Computed ${data.entries} entries`, description: 'Residual true-up applied so the sum equals the pool exactly.' });
      if (vars.kind === 'approve') toast({ title: 'Run approved (locked)' });
      if (vars.kind === 'pay') toast({ title: `Paid ${data.paid} members`, description: 'Credited to main savings accounts; GL posted; members notified.' });
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const createRunMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/dividends/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dividend-runs'] }); toast({ title: 'Dividend run created (DRAFT)' }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const ledgerColumns: ColumnSpec<any>[] = [
    { key: 'certificateRef', header: 'Certificate', type: 'text', defaultVisible: true },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'quantity', header: 'Shares', type: 'number', defaultVisible: true },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'unitPriceCents', header: 'Nominal value', type: 'money' },
    { key: 'feeCents', header: 'Fee', type: 'money' },
    { key: 'channel', header: 'Channel', type: 'badge' },
    { key: 'narration', header: 'Narration', type: 'text' },
    { key: 'createdAt', header: 'Date', type: 'date' },
  ];

  const positionColumns: ColumnSpec<any>[] = [
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'totalShares', header: 'Shares held', type: 'number', defaultVisible: true },
    { key: 'totalValueCents', header: 'Value (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'meetsMinimum', header: 'Meets minimum', type: 'bool', defaultVisible: true },
    { key: 'memberStatus', header: 'Member status', type: 'badge' },
    { key: 'lastDividendAt', header: 'Last dividend', type: 'date' },
  ];

  const runColumns: ColumnSpec<any>[] = [
    { key: 'year', header: 'Year', type: 'number', defaultVisible: true },
    { key: 'method', header: 'Method', type: 'badge', defaultVisible: true },
    { key: 'totalPoolCents', header: 'Pool (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'depositInterestBps', header: 'Deposit interest', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'entries', header: 'Entries', type: 'number' },
    { key: 'paidTotalCents', header: 'Paid total', type: 'money' },
    { key: 'computedAt', header: 'Computed', type: 'date' },
    { key: 'approvedAt', header: 'Approved', type: 'date' },
    { key: 'paidAt', header: 'Paid', type: 'date' },
  ];

  const purchaseSections: SectionDef[] = [
    {
      title: 'Share purchase', icon: Coins, description: 'Nominal value comes from Shares settings (default KES 500/share).',
      fields: [
        { name: 'memberProfileId', label: 'Member', type: 'select', required: true, options: (members.data ?? []).filter((m: any) => m.status === 'ACTIVE').map((m: any) => ({ value: m.id, label: `${m.name} (${m.memberNumber})` })) },
        { name: 'quantity', label: 'Number of shares', type: 'number', required: true, min: 1 },
        { name: 'channel', label: 'Funding channel', type: 'select', required: true, options: [
          { value: 'COUNTER', label: 'Counter cash' }, { value: 'SAVINGS', label: 'From member savings' }, { value: 'MPESA', label: 'M-Pesa' }, { value: 'ADMIN', label: 'Administrative' },
        ] },
        { name: 'savingsAccountId', label: 'Savings account (if from savings)', type: 'select', options: (savingsAccounts.data ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.member} (${fmtMoneyPlain(a.balanceCents)})` })) },
        { name: 'narration', label: 'Narration' },
      ],
    },
  ];

  const transferSections: SectionDef[] = [
    {
      title: 'Two-sided transfer', icon: ArrowLeftRight, description: 'Seller must stay above the minimum shareholding. A transfer fee applies (Shares settings).',
      fields: [
        { name: 'fromMemberId', label: 'From (seller)', type: 'select', required: true, options: (positions.data ?? []).map((p: any) => ({ value: p.memberId, label: `${p.member} — ${p.totalShares} shares` })) },
        { name: 'toMemberId', label: 'To (buyer)', type: 'select', required: true, options: (members.data ?? []).filter((m: any) => m.status === 'ACTIVE').map((m: any) => ({ value: m.id, label: `${m.name} (${m.memberNumber})` })) },
        { name: 'quantity', label: 'Shares to transfer', type: 'number', required: true, min: 1 },
        { name: 'narration', label: 'Narration' },
      ],
    },
  ];

  const runSections: SectionDef[] = [
    {
      title: 'Dividend run', icon: Sparkles,
      fields: [
        { name: 'year', label: 'Year', type: 'number', required: true, min: 2015 },
        { name: 'method', label: 'Method', type: 'select', required: true, options: [
          { value: 'PROPORTIONAL_SHARES', label: 'Proportional to shares held' },
          { value: 'SAVINGS_WEIGHTED', label: 'Weighted by savings balances' },
          { value: 'HYBRID', label: 'Hybrid (50/50)' },
        ] },
        { name: 'totalPool', label: 'Declared pool (KES)', type: 'money', required: true },
        { name: 'depositInterestBps', label: 'Deposit interest (% p.a.)', type: 'money', help: 'Used by savings-weighted / hybrid methods' },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title="Shares & Dividends"
        description="Share capital ledger, two-sided transfers, and annual dividend runs."
        actions={
          <>
            {can('shares_post') && <Button2 onClick={() => setPurchaseOpen(true)} icon={Coins} label="Buy shares" />}
            {can('shares_transfer') && <Button2 onClick={() => setTransferOpen(true)} icon={ArrowLeftRight} label="Transfer" />}
            {can('dividends_run') && <Button2 onClick={() => setRunOpen(true)} icon={Sparkles} label="New dividend run" primary />}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="ledger">Share ledger</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="dividends">Dividend runs</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <DataTable id="shares-ledger" title="Share capital ledger" subtitle="Purchases, transfers, refunds & bonuses" data={ledger.data ?? []} columns={ledgerColumns} stats searchKeys={['member', 'certificateRef']} exportPermission="loans_export" />
        </TabsContent>

        <TabsContent value="positions">
          <DataTable id="share-positions" title="Share positions" subtitle="Live holdings vs minimum requirement" data={positions.data ?? []} columns={positionColumns} stats searchKeys={['member']} exportPermission="loans_export" />
        </TabsContent>

        <TabsContent value="dividends">
          <DataTable
            id="dividend-runs"
            title="Dividend runs"
            subtitle="DRAFT → CALCULATED → APPROVED (locked) → PAID (credited to savings)"
            data={(runs.data ?? []).map((r: any) => ({ ...r, depositInterestBps: fmtBps(r.depositInterestBps) }))}
            columns={runColumns}
            searchKeys={['year', 'method']}
            exportPermission="loans_export"
            actions={[
              { label: 'Compute', icon: Play, color: 'extra', show: (r: any) => can('dividends_run') && ['DRAFT', 'CALCULATED'].includes(r.status), onClick: (r: any) => setConfirm({ id: r.id, kind: 'compute', label: 'Compute entries' }) },
              { label: 'Entries', icon: Banknote, color: 'view', show: (r: any) => ['CALCULATED', 'APPROVED', 'PAID'].includes(r.status), onClick: (r: any) => setEntriesFor(r.id) },
              { label: 'Approve', icon: ThumbsUp, color: 'approve', show: (r: any) => can('dividends_approve') && r.status === 'CALCULATED', onClick: (r: any) => setConfirm({ id: r.id, kind: 'approve', label: 'Approve & lock run' }) },
              { label: 'Pay', icon: Send, color: 'primary', show: (r: any) => can('dividends_pay') && r.status === 'APPROVED', onClick: (r: any) => setConfirm({ id: r.id, kind: 'pay', label: 'Pay dividend run' }) },
            ]}
          />
          {entriesFor && (
            <div className="dsms-pop public-card section-pad mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Entries preview</h3>
                <Button2 onClick={() => setEntriesFor(null)} label="Close" />
              </div>
              <div className="dsms-table-wrap">
                <table className="dsms-table">
                  <thead><tr><th>#</th><th>Member</th><th>Shares held</th><th>Avg savings</th><th>Share dividend</th><th>Deposit interest</th><th>Total payout</th><th>Paid</th></tr></thead>
                  <tbody>
                    {(entries.data ?? []).map((e: any, i: number) => (
                      <tr key={e.id}>
                        <td style={{ textAlign: 'center' }}>{i + 1}</td>
                        <td>{e.member}</td>
                        <td style={{ textAlign: 'right' }}>{e.sharesHeld}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.avgSavingsCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.shareDividendCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.depositInterestCents)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyPlain(e.totalPayoutCents)}</td>
                        <td>{e.paidAt ? fmtDate(e.paidAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FormModal open={purchaseOpen} onOpenChange={setPurchaseOpen} icon={Coins} title="Share purchase" subtitle="Equity GL posts atomically with the funding leg." schema={{ sections: purchaseSections }}
        onSubmit={async (v) => {
          await shareMut.mutateAsync({ endpoint: '/api/shares', payload: { memberProfileId: v.memberProfileId, quantity: Number(v.quantity), channel: v.channel, savingsAccountId: v.savingsAccountId || undefined, narration: v.narration || undefined } });
          setPurchaseOpen(false);
        }}
        submitLabel="Post purchase" />

      <FormModal open={transferOpen} onOpenChange={setTransferOpen} icon={ArrowLeftRight} title="Transfer shares" subtitle="Atomic two-sided update with transfer fee posting." schema={{ sections: transferSections }}
        onSubmit={async (v) => {
          await shareMut.mutateAsync({ endpoint: '/api/shares/transfer', payload: { fromMemberId: v.fromMemberId, toMemberId: v.toMemberId, quantity: Number(v.quantity), narration: v.narration || undefined } });
          setTransferOpen(false);
        }}
        submitLabel="Transfer shares" />

      <FormModal open={runOpen} onOpenChange={setRunOpen} icon={Sparkles} title="New dividend run" subtitle="Declared pool is distributed per method; Σ entries = pool exactly (residual true-up)." schema={{ sections: runSections }}
        onSubmit={async (v) => {
          await createRunMut.mutateAsync({ year: Number(v.year), method: v.method, totalPoolCents: v.totalPool ?? 0, depositInterestBps: Math.round(Number(v.depositInterestBps ?? 0) * 100) });
          setRunOpen(false);
        }}
        submitLabel="Create run" />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={() => setConfirm(null)}
        title={confirm?.label ?? ''}
        description={
          confirm?.kind === 'compute' ? 'Entries are computed from immutable ledgers. Re-open (recompute) is allowed while DRAFT/CALCULATED.'
          : confirm?.kind === 'approve' ? 'Approval locks the run (dual control). Figures cannot change afterwards.'
          : 'Payment credits each member\u2019s main savings account (channel DIVIDEND_CREDIT), posts the GL, and notifies every member.'
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
        danger={confirm?.kind === 'pay'}
        onConfirm={async () => { if (confirm) await runMut.mutateAsync(confirm); }}
      />
    </>
  );
}

function Button2({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon?: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={onClick} className={primary ? 'bg-[var(--t-primary)] text-white hover:brightness-110' : ''}>
      {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
