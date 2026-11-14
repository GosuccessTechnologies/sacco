'use client';
// Accounting — COA, journal, expenses, banks & reconciliation (guide §13.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Scale, FileSpreadsheet, Banknote, Building, Upload, Link2, Landmark, Receipt } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtDate, fmtDateTime, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AccountingPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = React.useState('journal');
  const [journalOpen, setJournalOpen] = React.useState(false);
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState<any | null>(null);
  const [csvText, setCsvText] = React.useState('');
  const [reverseFor, setReverseFor] = React.useState<any | null>(null);
  const [payFor, setPayFor] = React.useState<any | null>(null);
  const [reconFor, setReconFor] = React.useState<any | null>(null);
  const [approveFor, setApproveFor] = React.useState<any | null>(null);
  const [lineRows, setLineRows] = React.useState<any[]>([
    { accountCode: '', debit: '', credit: '', narration: '' },
    { accountCode: '', debit: '', credit: '', narration: '' },
  ]);

  const journal = useQuery({ queryKey: ['journal'], queryFn: async () => (await fetch('/api/accounting/journal')).json() });
  const coa = useQuery({ queryKey: ['coa'], queryFn: async () => (await fetch('/api/accounting/coa')).json() });
  const banks = useQuery({ queryKey: ['banks'], queryFn: async () => (await fetch('/api/accounting/banks')).json() });
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: async () => (await fetch('/api/accounting/expenses')).json() });
  const recons = useQuery({ queryKey: ['reconciliations'], queryFn: async () => (await fetch('/api/accounting/reconciliations')).json() });

  const mut = useMutation({
    mutationFn: async ({ endpoint, payload, method }: { endpoint: string; payload?: any; method?: string }) => {
      const res = await fetch(endpoint, { method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['banks'] }); qc.invalidateQueries({ queryKey: ['reconciliations'] }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const trial = banks.data?.trialBalance ?? [];
  const totals = banks.data?.totals ?? {};
  const check = banks.data?.check ?? 0;

  const journalColumns: ColumnSpec<any>[] = [
    { key: 'entryNo', header: 'Entry', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'date', header: 'Date', type: 'date', defaultVisible: true, filter: 'dateRange' },
    { key: 'memo', header: 'Memo', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'source', header: 'Source', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'totalCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'sourceRef', header: 'Source ref', type: 'text' },
  ];

  const coaColumns: ColumnSpec<any>[] = [
    { key: 'code', header: 'Code', type: 'text', defaultVisible: true },
    { key: 'name', header: 'Account', type: 'text', defaultVisible: true },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'cachedBalanceCents', header: 'Balance (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'isPostable', header: 'Postable', type: 'bool', defaultVisible: true },
    { key: 'active', header: 'Active', type: 'bool' },
  ];

  const expenseColumns: ColumnSpec<any>[] = [
    { key: 'description', header: 'Expense', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'vendor', header: 'Vendor', type: 'text', defaultVisible: true },
    { key: 'category', header: 'GL category', type: 'text', defaultVisible: true },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'billDate', header: 'Bill date', type: 'date' },
    { key: 'dueDate', header: 'Due date', type: 'date' },
    { key: 'paidVia', header: 'Paid via', type: 'badge' },
    { key: 'paymentRef', header: 'Payment ref', type: 'text' },
  ];

  const reconColumns: ColumnSpec<any>[] = [
    { key: 'bank', header: 'Bank', type: 'text', defaultVisible: true },
    { key: 'periodFrom', header: 'From', type: 'date', defaultVisible: true },
    { key: 'periodTo', header: 'To', type: 'date', defaultVisible: true },
    { key: 'statementBalanceCents', header: 'Statement', type: 'money', defaultVisible: true },
    { key: 'systemBalanceCents', header: 'System (GL)', type: 'money', defaultVisible: true },
    { key: 'differenceCents', header: 'Difference', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'approvedAt', header: 'Approved', type: 'date' },
  ];

  const bankList = (banks.data?.banks ?? []) as any[];
  const vendorList = (banks.data?.vendors ?? []) as any[];

  const expenseSections: SectionDef[] = [
    {
      title: 'Expense / bill', icon: Receipt,
      fields: [
        { name: 'description', label: 'Description', required: true },
        { name: 'amount', label: 'Amount (KES)', type: 'money', required: true },
        { name: 'glAccountCode', label: 'GL category', type: 'select', required: true, options: trial.filter((a: any) => a.type === 'EXPENSE').map((a: any) => ({ value: a.code, label: `${a.code} ${a.name}` })) },
        { name: 'vendorId', label: 'Vendor', type: 'select', options: vendorList.map((v: any) => ({ value: v.id, label: v.name })) },
        { name: 'billDate', label: 'Bill date', type: 'date', required: true },
        { name: 'dueDate', label: 'Due date', type: 'date' },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Accounting & General Financials"
        description="Double-entry ledger, vendors & bills, multi-bank reconciliation."
        actions={
          <>
            {can('accounting_journal_manual') && <Button2 onClick={() => setJournalOpen(true)} icon={Scale} label="Manual journal" />}
            {can('accounting_expenses') && <Button2 onClick={() => setExpenseOpen(true)} icon={Receipt} label="New expense" primary />}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="coa">Chart of accounts</TabsTrigger>
          <TabsTrigger value="statements">Financial statements</TabsTrigger>
          <TabsTrigger value="expenses">Expenses & bills</TabsTrigger>
          <TabsTrigger value="banks">Banks & reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <DataTable
            id="journal"
            title="General journal"
            subtitle="Every module posting lands here — immutable, reversible only by contra"
            data={(journal.data ?? []).map((j: any) => ({ ...j, date: j.date }))}
            columns={journalColumns}
            searchKeys={['entryNo', 'memo', 'sourceRef']}
            exportPermission="accounting_export"
            actions={can('accounting_reverse') ? [{ label: 'Reverse', icon: Landmark, color: 'delete', show: (r: any) => r.status === 'POSTED', onClick: (r: any) => setReverseFor(r) }] : []}
          />
        </TabsContent>

        <TabsContent value="coa">
          <DataTable id="coa" title="Chart of accounts" subtitle="Seeded tree — assets, liabilities, equity, income, expenses" data={coa.data ?? []} columns={coaColumns} searchKeys={['code', 'name']} exportPermission="accounting_export" />
        </TabsContent>

        <TabsContent value="statements">
          <div className="public-card section-pad">
            <h3 className="mb-3 text-sm font-bold">Trial balance</h3>
            <div className="dsms-table-wrap">
              <table className="dsms-table">
                <thead><tr><th>Code</th><th>Account</th><th>Type</th><th style={{ textAlign: 'right' }}>Balance (KES)</th></tr></thead>
                <tbody>
                  {trial.map((a: any) => (
                    <tr key={a.code}>
                      <td>{a.code}</td><td>{a.name}</td>
                      <td><Badge className={badgeClass[statusBadge(a.type).tone]}>{a.type}</Badge></td>
                      <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(a.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-bold">Check: Assets − Liabilities − Equity − Income + Expenses</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: check === 0 ? 'var(--t-success)' : 'var(--t-danger)' }}>{fmtMoneyPlain(check)} {check === 0 ? '✓ balanced' : '✗'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {Object.entries(totals).map(([type, bal]) => (
                <div key={type} className="rounded-lg p-3" style={{ background: 'var(--t-table-header-a)' }}>
                  <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{type}</p>
                  <p className="text-sm font-bold tabular-nums">{fmtMoneyPlain(bal as number)}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="expenses">
          <DataTable
            id="expenses"
            title="Expenses & bills"
            subtitle="DRAFT → APPROVED (manager) → PAID (GL posted)"
            data={expenses.data ?? []}
            columns={expenseColumns}
            searchKeys={['description', 'vendor']}
            exportPermission="accounting_export"
            actions={[
              { label: 'Approve', icon: FileSpreadsheet, color: 'approve', show: (r: any) => can('accounting_expenses_approve') && r.status === 'DRAFT', onClick: (r: any) => mut.mutate({ endpoint: `/api/accounting/expenses/${r.id}/pay`, payload: { action: 'approve' } }) },
              { label: 'Pay', icon: Banknote, color: 'primary', show: (r: any) => can('accounting_expenses') && r.status === 'APPROVED', onClick: (r: any) => setPayFor(r) },
            ]}
          />
        </TabsContent>

        <TabsContent value="banks">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bankList.map((b: any) => (
              <div key={b.id} className="public-card section-pad">
                <p className="text-sm font-bold">{b.bankName}</p>
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{b.name} · {b.accountNumber}</p>
                <p className="mt-2 text-xs">GL: {b.gl} · {b.lines} statement lines</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {can('accounting_reconcile') && <Button2 onClick={() => setImportOpen(b)} icon={Upload} label="Import statement" />}
                  {can('accounting_reconcile') && <Button2 onClick={() => setReconFor(b)} icon={Link2} label="Reconcile" />}
                </div>
              </div>
            ))}
          </div>
          <DataTable
            id="reconciliations"
            title="Bank reconciliations"
            subtitle="Statement vs system — difference must be zero before approval (period lock)"
            data={recons.data ?? []}
            columns={reconColumns}
            searchKeys={['bank']}
            exportPermission="accounting_export"
            actions={can('accounting_reconcile_approve') ? [{ label: 'Approve', icon: FileSpreadsheet, color: 'approve', show: (r: any) => r.status === 'DRAFT' && r.differenceCents === 0, onClick: (r: any) => setApproveFor(r) }] : []}
          />
        </TabsContent>
      </Tabs>

      {/* manual journal */}
      <Dialog2 open={journalOpen} onClose={() => setJournalOpen(false)} title="Manual journal entry" icon={Scale}
        description="Debits must equal credits — the indicator turns green when balanced."
        onSubmit={async () => {
          const lines = lineRows
            .map((l) => ({ accountCode: l.accountCode, debitCents: Math.round(Number((l.debit || '0').replace(/,/g, '')) * 100), creditCents: Math.round(Number((l.credit || '0').replace(/,/g, '')) * 100), narration: l.narration || undefined }))
            .filter((l) => l.accountCode && (l.debitCents > 0 || l.creditCents > 0));
          const memo = (document.getElementById('jm-memo') as HTMLInputElement)?.value ?? 'Manual journal';
          await mut.mutate({ endpoint: '/api/accounting/journal', payload: { memo, lines } });
          toast({ title: 'Journal posted' });
          setJournalOpen(false);
        }}>
        <input id="jm-memo" placeholder="Memo (required)" className="dsms-input mb-3 h-10 w-full" />
        <div className="space-y-2">
          {lineRows.map((l, i) => {
            const totalDebit = lineRows.reduce((s, x) => s + Number((x.debit || '0').replace(/,/g, '')) * 100 || 0, 0);
            const totalCredit = lineRows.reduce((s, x) => s + Number((x.credit || '0').replace(/,/g, '')) * 100 || 0, 0);
            const balanced = totalDebit === totalCredit && totalDebit > 0;
            return (
              <React.Fragment key={i}>
                <div className="grid grid-cols-12 gap-2">
                  <select className="dsms-input col-span-4 h-9 text-xs" value={l.accountCode} onChange={(e) => setLineRows((p) => p.map((x, j) => j === i ? { ...x, accountCode: e.target.value } : x))}>
                    <option value="">Account…</option>
                    {trial.map((a: any) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </select>
                  <input className="dsms-input col-span-3 h-9 text-xs" placeholder="Debit" value={l.debit} onChange={(e) => setLineRows((p) => p.map((x, j) => j === i ? { ...x, debit: e.target.value } : x))} />
                  <input className="dsms-input col-span-3 h-9 text-xs" placeholder="Credit" value={l.credit} onChange={(e) => setLineRows((p) => p.map((x, j) => j === i ? { ...x, credit: e.target.value } : x))} />
                  <input className="dsms-input col-span-2 h-9 text-xs" placeholder="Note" value={l.narration} onChange={(e) => setLineRows((p) => p.map((x, j) => j === i ? { ...x, narration: e.target.value } : x))} />
                </div>
                {i === lineRows.length - 1 && (
                  <div className="flex items-center justify-between text-xs">
                    <Badge className={balanced ? badgeClass.success : badgeClass.danger}>
                      Dr {fmtMoneyPlain(totalDebit)} / Cr {fmtMoneyPlain(totalCredit)} {balanced ? '— balanced' : '— unbalanced'}
                    </Badge>
                    <button type="button" className="font-semibold" style={{ color: 'var(--t-primary)' }} onClick={() => setLineRows((p) => [...p, { accountCode: '', debit: '', credit: '', narration: '' }])}>+ line</button>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Dialog2>

      {/* expense modal */}
      <FormModal open={expenseOpen} onOpenChange={setExpenseOpen} icon={Receipt} title="New expense / bill" subtitle="Approval by manager, payment posts the GL pair." schema={{ sections: expenseSections }}
        onSubmit={async (v) => {
          await mut.mutate({ endpoint: '/api/accounting/expenses', payload: { description: v.description, amountCents: v.amount ?? 0, glAccountCode: v.glAccountCode, vendorId: v.vendorId || null, billDate: v.billDate, dueDate: v.dueDate || null } });
          toast({ title: 'Expense created (DRAFT)' });
          setExpenseOpen(false);
        }}
        submitLabel="Create expense" />

      {/* statement import */}
      <Dialog2 open={Boolean(importOpen)} onClose={() => setImportOpen(null)} title={`Import statement — ${importOpen?.name ?? ''}`} icon={Upload}
        description="Paste CSV with columns: date, description, ref, amount (signed). Duplicates are skipped automatically."
        onSubmit={async () => {
          await mut.mutate({ endpoint: `/api/accounting/banks/${importOpen.id}/import`, payload: { csv: csvText, mapping: { date: 'date', valueDate: 'value date', description: 'description', ref: 'ref', amount: 'amount' } } });
          toast({ title: 'Statement imported' });
          setCsvText('');
        }}>
        <p className="mb-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>
          Template: <code>date,value date,description,ref,amount</code> — e.g. <code>2026-11-02,2026-11-03,"POS CHARGE KCB",TRX88,-450.00</code>
        </p>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} placeholder="date,value date,description,ref,amount" className="dsms-textarea w-full font-mono text-xs" />
      </Dialog2>

      {/* pay expense */}
      <Dialog2 open={Boolean(payFor)} onClose={() => setPayFor(null)} title={`Pay — ${payFor?.description ?? ''}`} icon={Banknote}
        description="Payment posts: DR expense category · CR settlement account."
        onSubmit={async () => {
          const via = (document.getElementById('pay-via') as HTMLSelectElement)?.value ?? 'BANK';
          const ref = (document.getElementById('pay-ref') as HTMLInputElement)?.value ?? '';
          await mut.mutate({ endpoint: `/api/accounting/expenses/${payFor.id}/pay`, payload: { action: 'pay', paidVia: via, paymentRef: ref } });
          toast({ title: 'Expense paid & posted' });
        }}>
        <select id="pay-via" className="dsms-input mb-2 h-10">
          <option value="BANK">Bank transfer</option><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option>
        </select>
        <input id="pay-ref" placeholder="Payment reference" className="dsms-input h-10 w-full" />
      </Dialog2>

      {/* create reconciliation */}
      <Dialog2 open={Boolean(reconFor)} onClose={() => setReconFor(null)} title={`Reconcile — ${reconFor?.name ?? ''}`} icon={Link2}
        description="System balance is pulled from the GL; you supply the bank statement closing balance."
        onSubmit={async () => {
          const from = (document.getElementById('rc-from') as HTMLInputElement)?.value;
          const to = (document.getElementById('rc-to') as HTMLInputElement)?.value;
          const stmt = (document.getElementById('rc-stmt') as HTMLInputElement)?.value;
          await mut.mutate({ endpoint: '/api/accounting/reconciliations', payload: { bankId: reconFor.id, periodFrom: from, periodTo: to, statementBalanceCents: Math.round(Number((stmt || '0').replace(/,/g, '')) * 100) } });
          toast({ title: 'Reconciliation drafted — check the difference' });
        }}>
        <div className="grid grid-cols-2 gap-2">
          <input id="rc-from" type="date" className="dsms-input h-10" aria-label="From" />
          <input id="rc-to" type="date" className="dsms-input h-10" aria-label="To" />
          <input id="rc-stmt" placeholder="Statement closing balance (KES)" className="dsms-input col-span-2 h-10" />
        </div>
      </Dialog2>

      <ConfirmDialog open={Boolean(reverseFor)} onOpenChange={() => setReverseFor(null)} title={`Reverse ${reverseFor?.entryNo}?`} description="A contra entry is posted; the original is marked REVERSED (immutable ledger)." confirmLabel="Reverse" danger
        onConfirm={async () => { await mut.mutate({ endpoint: `/api/accounting/journal/${reverseFor.id}/reverse`, payload: { reason: 'Office correction' } }); toast({ title: 'Reversed with contra entry' }); }} />

      <ConfirmDialog open={Boolean(approveFor)} onOpenChange={() => setApproveFor(null)} title={`Approve ${approveFor?.bank ?? ''}?`} description="Approval locks the period: statement lines become RECONCILED." confirmLabel="Approve & lock"
        onConfirm={async () => { await mut.mutate({ endpoint: `/api/accounting/reconciliations/${approveFor.id}/approve`, payload: {} }); toast({ title: 'Period locked' }); }} />
    </>
  );
}

function Dialog2({ open, onClose, title, description, icon: Icon, onSubmit, children }: any) {
  return (
    <FormModal open={open} onOpenChange={(o: boolean) => !o && onClose()} icon={Icon} title={title} subtitle={description}
      schema={{ sections: [{ title: 'Details', fields: [{ name: '__none', label: '', type: 'switch' }] }] }}
      submitLabel="Submit"
      onSubmit={async () => { await onSubmit(); }}>
      {children}
    </FormModal>
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
