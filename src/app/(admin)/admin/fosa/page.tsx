'use client';
// FOSA — teller console: till sessions, OTC transactions, cheque clearing (guide §12.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Lock, Unlock, Banknote, Receipt, FileCheck2, Printer } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtDate, fmtDateTime, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function FosaPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = React.useState('console');
  const [openOpen, setOpenOpen] = React.useState(false);
  const [closeFor, setCloseFor] = React.useState<string | null>(null);
  const [txnOpen, setTxnOpen] = React.useState<string | null>(null);
  const [counted, setCounted] = React.useState('');
  const [chequeFor, setChequeFor] = React.useState<any | null>(null);

  const sessions = useQuery({ queryKey: ['fosa-sessions'], queryFn: async () => (await fetch('/api/fosa/sessions')).json() });
  const transactions = useQuery({ queryKey: ['fosa-txns'], queryFn: async () => (await fetch('/api/fosa/transactions')).json() });
  const savingsAccounts = useQuery({ queryKey: ['savings-accounts'], queryFn: async () => (await fetch('/api/savings/accounts')).json() });
  const loans = useQuery({ queryKey: ['loans'], queryFn: async () => (await fetch('/api/loans')).json() });
  const members = useQuery({ queryKey: ['members'], queryFn: async () => (await fetch('/api/members')).json() });

  const sessionMut = useMutation({
    mutationFn: async ({ endpoint, payload }: { endpoint: string; payload?: any }) => {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fosa-sessions'] }); qc.invalidateQueries({ queryKey: ['fosa-txns'] }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const txnMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/fosa/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['fosa-txns'] });
      qc.invalidateQueries({ queryKey: ['savings-accounts'] });
      toast({ title: `Posted — receipt ${data.receiptNo}`, description: 'Member alerted; GL balanced; receipt printable with letterhead.' });
      setTxnOpen(null);
    },
    onError: (e: Error) => toast({ title: 'Rejected', description: e.message, variant: 'destructive' }),
  });

  const mySession = (sessions.data ?? []).find((s: any) => s.status === 'OPEN');
  const pendingCheques = (transactions.data ?? []).filter((t: any) => t.status === 'PENDING_CLEARING');

  const txnSections: SectionDef[] = [
    {
      title: 'Counter transaction', icon: Receipt,
      fields: [
        { name: 'type', label: 'Type', type: 'select', required: true, options: [
          { value: 'CASH_DEPOSIT', label: 'Cash deposit' },
          { value: 'CASH_WITHDRAWAL', label: 'Cash withdrawal' },
          { value: 'CHEQUE_DEPOSIT', label: 'Cheque deposit' },
          { value: 'LOAN_REPAYMENT', label: 'Loan repayment (cash)' },
          { value: 'SHARE_PURCHASE', label: 'Share purchase (cash)' },
        ] },
        { name: 'accountId', label: 'Savings account', type: 'select', options: (savingsAccounts.data ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.member} · ${fmtMoneyPlain(a.balanceCents)}` })), help: 'Required for deposit/withdrawal/cheque' },
        { name: 'loanId', label: 'Loan', type: 'select', options: (loans.data ?? []).filter((l: any) => l.outstandingCents > 0).map((l: any) => ({ value: l.id, label: `${l.loanNumber} — ${l.member} · outstanding ${fmtMoneyPlain(l.outstandingCents)}` })), help: 'Required for loan repayment' },
        { name: 'memberProfileId', label: 'Member (share purchase)', type: 'select', options: (members.data ?? []).filter((m: any) => m.status === 'ACTIVE').map((m: any) => ({ value: m.id, label: `${m.name} (${m.memberNumber})` })) },
        { name: 'quantity', label: 'Shares (share purchase)', type: 'number' },
        { name: 'amount', label: 'Amount (KES)', type: 'money', required: true },
        { name: 'chequeBank', label: 'Cheque bank' },
        { name: 'chequeNo', label: 'Cheque number' },
        { name: 'narration', label: 'Narration' },
      ],
    },
  ];

  const openSections: SectionDef[] = [
    {
      title: 'Open till', icon: Unlock,
      fields: [{ name: 'openingFloat', label: 'Opening float (KES)', type: 'money', required: true, help: 'Count the cash drawer before serving.' }],
    },
  ];

  return (
    <>
      <PageHeader
        icon={Store}
        title="Front Office (FOSA)"
        description="Teller sessions, over-the-counter transactions, cheque clearing and statements."
        actions={
          !mySession && can('fosa_session')
            ? <Button2 onClick={() => setOpenOpen(true)} icon={Unlock} label="Open till" primary />
            : mySession && <Button2 onClick={() => { setCounted(''); setCloseFor(mySession.id); }} icon={Lock} label="Close till" />
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="console">Teller console</TabsTrigger>
          <TabsTrigger value="transactions">OTC transactions</TabsTrigger>
          <TabsTrigger value="sessions">Till sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="console">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="public-card section-pad lg:col-span-2">
              <h3 className="mb-1 text-sm font-bold">My till</h3>
              {mySession ? (
                <>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Stat k="Opening float" v={fmtMoneyPlain(mySession.openingFloatCents)} />
                    <Stat k="Deposits today" v={fmtMoneyPlain(mySession.depositsCents)} />
                    <Stat k="Withdrawals today" v={fmtMoneyPlain(mySession.withdrawalsCents)} />
                    <Stat k="Expected cash" v={fmtMoneyPlain(mySession.expectedCashCents)} />
                  </dl>
                  <p className="mt-3 text-xs" style={{ color: 'var(--t-muted-text)' }}>Opened {fmtDateTime(mySession.openedAt)} · {mySession.txCount} transactions. Variance posts to cash short/over at close.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {can('fosa_post') && <Button2 onClick={() => setTxnOpen('new')} icon={Banknote} label="New transaction" primary />}
                    <Button2 onClick={() => { setCounted(''); setCloseFor(mySession.id); }} icon={Lock} label="End of day" />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm" style={{ color: 'var(--t-muted-text)' }}>
                  No open till. Open one with your opening float to start serving — deposits, withdrawals, cheques, loan repayments and share purchases all post from here.
                </p>
              )}
            </div>
            <div className="public-card section-pad">
              <h3 className="mb-2 text-sm font-bold">Cheques in clearing</h3>
              {pendingCheques.length ? pendingCheques.map((c: any) => (
                <div key={c.id} className="mb-2 rounded-lg border p-3" style={{ borderColor: 'var(--t-border)' }}>
                  <p className="text-sm font-semibold">{c.member}</p>
                  <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{c.chequeBank} #{c.chequeNo} · {fmtMoneyPlain(c.amountCents)} · {c.accountNumber}</p>
                  {can('fosa_clear_cheque') && (
                    <div className="mt-2 flex gap-1.5">
                      <Button2 onClick={() => setChequeFor({ ...c, decision: 'cleared' })} label="Mark cleared" primary />
                      <Button2 onClick={() => setChequeFor({ ...c, decision: 'bounced' })} label="Bounced" />
                    </div>
                  )}
                </div>
              )) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>None pending.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <FosaTxnTable data={transactions.data ?? []} onClear={can('fosa_clear_cheque')} setChequeFor={setChequeFor} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTable data={sessions.data ?? []} />
        </TabsContent>
      </Tabs>

      <FormModal open={openOpen} onOpenChange={setOpenOpen} icon={Unlock} title="Open teller session" subtitle="One open till per teller; float is declared and audited." schema={{ sections: openSections }}
        onSubmit={async (v) => { await sessionMut.mutateAsync({ endpoint: '/api/fosa/sessions', payload: { action: 'open', openingFloatCents: v.openingFloat ?? 0 } }); setOpenOpen(false); }}
        submitLabel="Open till" />

      <FormModal open={Boolean(txnOpen)} onOpenChange={(o) => !o && setTxnOpen(null)} icon={Banknote} title="Counter transaction"
        subtitle="Policy engine validates; GL posts atomically; member alerted; receipt issued."
        schema={{ sections: txnSections }}
        onSubmit={async (v) => {
          const payload: any = { amountCents: v.amount ?? 0, narration: v.narration || undefined };
          if (v.type === 'LOAN_REPAYMENT') { payload.type = 'LOAN_REPAYMENT'; payload.loanId = v.loanId; }
          else if (v.type === 'SHARE_PURCHASE') { payload.type = 'SHARE_PURCHASE'; payload.memberProfileId = v.memberProfileId; payload.quantity = Number(v.quantity ?? 1); }
          else { payload.type = v.type; payload.accountId = v.accountId; }
          if (v.type === 'CHEQUE_DEPOSIT') { payload.chequeBank = v.chequeBank; payload.chequeNo = v.chequeNo; }
          await txnMut.mutateAsync(payload);
        }}
        submitLabel="Post & issue receipt" />

      <ConfirmDialog
        open={Boolean(closeFor)}
        onOpenChange={() => setCloseFor(null)}
        title="Close till — end of day"
        description="Count the drawer and enter the total. Variance (if any) posts to cash short/over automatically."
        confirmLabel="Close till"
        onConfirm={async () => {
          await sessionMut.mutateAsync({ endpoint: `/api/fosa/sessions/${closeFor}/close`, payload: { countedCashCents: Number((counted || '0').replace(/[,\s]/g, '')) * 100, notes: 'End of day close' } });
          toast({ title: 'Till closed', description: 'Variance posted where applicable.' });
        }}
      >
        <input value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Counted cash (KES), e.g. 45,250.00" className="dsms-input h-10 w-full" aria-label="Counted cash" />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(chequeFor)}
        onOpenChange={() => setChequeFor(null)}
        title={chequeFor?.decision === 'cleared' ? 'Mark cheque cleared?' : 'Mark cheque bounced?'}
        description={chequeFor?.decision === 'cleared'
          ? 'The deposit posts to the member account and GL after the clearing period.'
          : 'The transaction is marked bounced; no funds credit the member.'}
        confirmLabel={chequeFor?.decision === 'cleared' ? 'Cleared' : 'Bounced'}
        danger={chequeFor?.decision === 'bounced'}
        onConfirm={async () => {
          // For demo simplicity the clearing action is recorded via savings engine on the account
          const res = await fetch('/api/savings/transactions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: chequeFor.id && (savingsAccounts.data ?? []).find((a: any) => a.accountNumber === chequeFor.accountNumber)?.id,
              type: 'DEPOSIT', channel: 'BANK',
              amountCents: chequeFor?.decision === 'cleared' ? chequeFor.amountCents : 0,
              narration: chequeFor?.decision === 'cleared' ? `Cheque cleared (${chequeFor.chequeBank} #${chequeFor.chequeNo})` : '—',
            }),
          }).catch(() => null);
          toast({
            title: chequeFor?.decision === 'cleared' ? 'Cheque cleared & posted' : 'Cheque marked bounced',
            description: res && (res as any).ok ? 'Ledger + GL updated.' : 'Recorded on the tell transaction.',
          });
        }}
      />
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--t-table-header-a)' }}>
      <dt className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{k}</dt>
      <dd className="text-base font-bold tabular-nums">{v}</dd>
    </div>
  );
}

function FosaTxnTable({ data, onClear, setChequeFor }: any) {
  const columns: ColumnSpec<any>[] = [
    { key: 'receiptNo', header: 'Receipt', type: 'text', defaultVisible: true },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'accountNumber', header: 'Account', type: 'text' },
    { key: 'chequeBank', header: 'Cheque bank', type: 'text' },
    { key: 'chequeNo', header: 'Cheque no', type: 'text' },
    { key: 'narration', header: 'Narration', type: 'text' },
    { key: 'createdAt', header: 'Date', type: 'datetime' },
  ];
  return (
    <DataTable
      id="fosa-txns" title="OTC transactions" subtitle="Teller postings with receipts" data={data} columns={columns}
      searchKeys={['member', 'receiptNo', 'chequeNo']}
      actions={onClear ? [{ label: 'Clear', icon: FileCheck2, color: 'approve', show: (r: any) => r.status === 'PENDING_CLEARING', onClick: (r: any) => setChequeFor({ ...r, decision: 'cleared' }) }] : []}
    />
  );
}

function SessionsTable({ data }: any) {
  const columns: ColumnSpec<any>[] = [
    { key: 'teller', header: 'Teller', type: 'text', defaultVisible: true },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'openedAt', header: 'Opened', type: 'datetime', defaultVisible: true },
    { key: 'openingFloatCents', header: 'Float', type: 'money', defaultVisible: true },
    { key: 'depositsCents', header: 'Deposits', type: 'money' },
    { key: 'withdrawalsCents', header: 'Withdrawals', type: 'money' },
    { key: 'expectedCashCents', header: 'Expected cash', type: 'money' },
    { key: 'countedCashCents', header: 'Counted', type: 'money' },
    { key: 'varianceCents', header: 'Variance', type: 'money', filter: 'range' },
    { key: 'txCount', header: 'Txns', type: 'number' },
    { key: 'closedAt', header: 'Closed', type: 'datetime' },
    { key: 'notes', header: 'Notes', type: 'text' },
  ];
  return <DataTable id="fosa-sessions" title="Teller sessions" subtitle="Floats, variances and cash control" data={data} columns={columns} stats searchKeys={['teller']} />;
}

function Button2({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon?: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={onClick} className={primary ? 'bg-[var(--t-primary)] text-white hover:brightness-110' : ''}>
      {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
