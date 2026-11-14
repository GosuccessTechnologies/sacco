'use client';
// Savings & Deposits — products, accounts, transactions ledger, standing orders (guide §9.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, RefreshCcw, Banknote, CalendarClock, Boxes, Undo2, Snowflake } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { ConfirmDialog } from '@/components/kit/kit-bits';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtBps, fmtDate } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export default function SavingsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = React.useState('accounts');
  const [postOpen, setPostOpen] = React.useState(false);
  const [productOpen, setProductOpen] = React.useState(false);
  const [orderOpen, setOrderOpen] = React.useState(false);
  const [reverse, setReverse] = React.useState<{ id: string; reference: string } | null>(null);

  const accounts = useQuery({ queryKey: ['savings-accounts'], queryFn: async () => (await fetch('/api/savings/accounts')).json() });
  const products = useQuery({ queryKey: ['savings-products'], queryFn: async () => (await fetch('/api/savings/products')).json() });
  const transactions = useQuery({ queryKey: ['savings-txns'], queryFn: async () => (await fetch('/api/savings/transactions')).json() });
  const orders = useQuery({ queryKey: ['standing-orders'], queryFn: async () => (await fetch('/api/savings/standing-orders')).json() });

  const postTxn = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/savings/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { toast({ title: 'Transaction posted', description: 'Ledger + GL updated and member alerted.' }); qc.invalidateQueries({ queryKey: ['savings-txns'] }); qc.invalidateQueries({ queryKey: ['savings-accounts'] }); },
    onError: (e: Error) => toast({ title: 'Rejected by policy engine', description: e.message, variant: 'destructive' }),
  });
  const productMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/savings/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { toast({ title: 'Product saved' }); qc.invalidateQueries({ queryKey: ['savings-products'] }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });
  const orderMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/savings/standing-orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { toast({ title: 'Standing order created' }); qc.invalidateQueries({ queryKey: ['standing-orders'] }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });
  const reverseMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/savings/transactions/${id}/reverse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { toast({ title: 'Reversed with contra entry' }); qc.invalidateQueries({ queryKey: ['savings-txns'] }); },
    onError: (e: Error) => toast({ title: 'Cannot reverse', description: e.message, variant: 'destructive' }),
  });


  const accountColumns: ColumnSpec<any>[] = [
    { key: 'accountNumber', header: 'Account', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'product', header: 'Product', type: 'text', defaultVisible: true },
    { key: 'balanceCents', header: 'Balance (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'heldFundsCents', header: 'Guarantee hold', type: 'money' },
    { key: 'interestEarnedCents', header: 'Interest earned', type: 'money' },
    { key: 'status', header: 'Status', type: 'badge', filter: 'select' },
    { key: 'type', header: 'Product type', type: 'badge' },
    { key: 'name', header: 'Account name', type: 'text' },
    { key: 'targetCents', header: 'Target', type: 'money' },
    { key: 'maturityDate', header: 'Maturity', type: 'date' },
    { key: 'txCount', header: 'Txns', type: 'number' },
    { key: 'lastActivityAt', header: 'Last activity', type: 'date' },
  ];

  const txnColumns: ColumnSpec<any>[] = [
    { key: 'valueDate', header: 'Date', type: 'date', defaultVisible: true, filter: 'dateRange' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'channel', header: 'Channel', type: 'badge' },
    { key: 'balanceAfterCents', header: 'Balance after', type: 'money' },
    { key: 'reference', header: 'Reference', type: 'text' },
    { key: 'narration', header: 'Narration', type: 'text' },
    { key: 'externalRef', header: 'M-Pesa ref', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge', filter: 'select' },
    { key: 'accountNumber', header: 'Account', type: 'text' },
  ];

  const orderColumns: ColumnSpec<any>[] = [
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'from', header: 'From account', type: 'text', defaultVisible: true },
    { key: 'to', header: 'To', type: 'text', defaultVisible: true },
    { key: 'amountCents', header: 'Amount (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'destinationType', header: 'Destination', type: 'badge' },
    { key: 'dayOfMonth', header: 'Day of month', type: 'number' },
    { key: 'nextRunAt', header: 'Next run', type: 'date' },
    { key: 'active', header: 'Active', type: 'bool' },
    { key: 'consecutiveFailures', header: 'Failures', type: 'number' },
  ];

  const productColumns: ColumnSpec<any>[] = [
    { key: 'code', header: 'Code', type: 'text', defaultVisible: true },
    { key: 'name', header: 'Product', type: 'text', defaultVisible: true },
    { key: 'interestRateBps', header: 'Rate p.a.', type: 'text', defaultVisible: true },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true },
    { key: 'minBalanceCents', header: 'Min balance', type: 'money' },
    { key: 'minOpeningCents', header: 'Min opening', type: 'money' },
    { key: 'withdrawalPolicy', header: 'Withdrawal policy', type: 'badge' },
    { key: 'lockInMonths', header: 'Lock-in (months)', type: 'number' },
    { key: 'isDefault', header: 'Default product', type: 'bool' },
    { key: 'isPublic', header: 'On website', type: 'bool' },
    { key: 'active', header: 'Active', type: 'bool' },
  ];

  const postSections: SectionDef[] = [
    {
      title: 'Transaction', icon: Banknote,
      fields: [
        { name: 'accountId', label: 'Account', type: 'select', required: true, options: (accounts.data ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.member} (${a.product})` })) },
        { name: 'type', label: 'Type', type: 'select', required: true, options: [
          { value: 'DEPOSIT', label: 'Deposit' }, { value: 'WITHDRAWAL', label: 'Withdrawal' }, { value: 'FEE', label: 'Fee' }, { value: 'ADJUSTMENT', label: 'Adjustment' },
        ] },
        { name: 'channel', label: 'Channel', type: 'select', required: true, options: [
          { value: 'COUNTER', label: 'Counter (FOSA)' }, { value: 'MPESA', label: 'M-Pesa' }, { value: 'BANK', label: 'Bank' }, { value: 'INTERNAL', label: 'Internal transfer' }, { value: 'STANDING_ORDER', label: 'Standing order' },
        ] },
        { name: 'amount', label: 'Amount (KES)', type: 'money', required: true, placeholder: '5,000.00' },
        { name: 'narration', label: 'Narration' },
        { name: 'externalRef', label: 'External reference (e.g. M-Pesa code)' },
      ],
    },
  ];

  const productSections: SectionDef[] = [
    {
      title: 'Product basics', icon: Boxes,
      fields: [
        { name: 'code', label: 'Code (unique)', required: true },
        { name: 'name', label: 'Name', required: true },
        { name: 'type', label: 'Type', type: 'select', required: true, options: ['REGULAR', 'FIXED', 'HOLIDAY', 'CHRISTMAS', 'JUNIOR', 'TARGET'].map((v) => ({ value: v, label: v })) },
        { name: 'description', label: 'Description', type: 'textarea' },
      ],
    },
    {
      title: 'Rates & fees', cols: 2,
      fields: [
        { name: 'interestRateBps', label: 'Interest (% p.a.)', type: 'money', help: 'Stored as basis points — enter 3 for 3%' },
        { name: 'minOpening', label: 'Min opening (KES)', type: 'money' },
        { name: 'minBalance', label: 'Min balance (KES)', type: 'money' },
        { name: 'monthlyFee', label: 'Monthly ledger fee (KES)', type: 'money' },
        { name: 'withdrawalPenaltyBps', label: 'Withdrawal penalty (%)', type: 'money' },
        { name: 'lockInMonths', label: 'Lock-in (months)', type: 'number', defaultValue: 0 },
      ],
    },
    {
      title: 'Policy & visibility', cols: 2,
      fields: [
        { name: 'withdrawalPolicy', label: 'Withdrawal policy', type: 'select', required: true, options: [
          { value: 'FREE', label: 'Free' }, { value: 'LOCKED_UNTIL_MATURITY', label: 'Locked until maturity' }, { value: 'PENALTY', label: 'Penalty' }, { value: 'APPROVAL_REQUIRED', label: 'Approval required' },
        ] },
        { name: 'maturityTermsMonths', label: 'Maturity term (months, FIXED)', type: 'number' },
        { name: 'isDefault', label: 'Default product (new members)', type: 'switch' },
        { name: 'isPublic', label: 'Show on public website', type: 'switch', defaultValue: true },
        { name: 'active', label: 'Active', type: 'switch', defaultValue: true },
        { name: 'sortOrder', label: 'Sort order', type: 'number', defaultValue: 10 },
      ],
    },
  ];

  const orderSections: SectionDef[] = [
    {
      title: 'Standing order', icon: CalendarClock,
      fields: [
        { name: 'memberProfileId', label: 'Member', type: 'select', required: true, options: (accounts.data ?? []).map((a: any) => ({ value: a.memberId, label: a.member })) },
        { name: 'fromAccountId', label: 'From account', type: 'select', required: true, options: (accounts.data ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.product}` })) },
        { name: 'destinationType', label: 'Destination', type: 'select', required: true, options: [{ value: 'INTERNAL', label: 'Another Divine account' }, { value: 'EXTERNAL_BANK', label: 'External bank (instruction)' }] },
        { name: 'toAccountId', label: 'To account (internal)', type: 'select', options: (accounts.data ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.member}` })) },
        { name: 'bankInstruction', label: 'Bank instruction (external)' },
        { name: 'amount', label: 'Amount (KES)', type: 'money', required: true },
        { name: 'dayOfMonth', label: 'Day of month (1–28)', type: 'number', required: true, min: 1, max: 28, defaultValue: 5 },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={PiggyBank}
        title="Savings & Deposits"
        description="Products, account ledger with real-time balances, and standing orders."
        actions={
          <>
            {can('savings_post') && <Button2 onClick={() => setPostOpen(true)} icon={Banknote} label="Post transaction" primary />}
            {can('savings_products') && <Button2 onClick={() => setProductOpen(true)} icon={Boxes} label="New product" />}
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ledger</TabsTrigger>
          <TabsTrigger value="orders">Standing orders</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <DataTable
            id="savings-accounts"
            title="Savings accounts"
            subtitle="Per-product member accounts with live balances"
            data={accounts.data ?? []}
            columns={accountColumns}
            stats
            searchKeys={['accountNumber', 'member', 'product']}
            exportPermission="savings_export"
            emptyMessage={accounts.isLoading ? 'Loading…' : 'No accounts yet.'}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <DataTable
            id="savings-txns"
            title="Savings transactions ledger"
            subtitle="Every deposit, withdrawal, fee & interest posting — GL-balanced"
            data={transactions.data ?? []}
            columns={txnColumns}
            stats
            searchKeys={['member', 'reference', 'narration', 'externalRef']}
            exportPermission="savings_export"
            actions={can('savings_reverse') ? [{ label: 'Reverse', icon: Undo2, color: 'delete', show: (r: any) => r.status === 'COMPLETED', onClick: (r: any) => setReverse({ id: r.id, reference: r.reference }) }] : []}
          />
        </TabsContent>

        <TabsContent value="orders">
          <DataTable
            id="standing-orders"
            title="Standing orders"
            subtitle="Automated recurring transfers — executed by the daily job"
            data={(orders.data as any) ?? []}
            columns={orderColumns}
            searchKeys={['member', 'from', 'to']}
            emptyMessage="No standing orders yet."
            toolbarExtra={can('savings_orders') ? <Button2 onClick={() => setOrderOpen(true)} icon={CalendarClock} label="New order" primary /> : undefined}
          />
        </TabsContent>

        <TabsContent value="products">
          <DataTable
            id="savings-products"
            title="Savings products"
            subtitle="Product configuration — instantly reflected on the public website"
            data={(products.data ?? []).map((p: any) => ({ ...p, interestRateBps: fmtBps(p.interestRateBps) }))}
            columns={productColumns}
            searchKeys={['code', 'name']}
            emptyMessage="No products configured."
          />
        </TabsContent>
      </Tabs>

      <FormModal open={postOpen} onOpenChange={setPostOpen} icon={Banknote} title="Post savings transaction"
        subtitle="Policy engine validates (min balance, lock-in, holds, limits); GL posts atomically and the member is alerted."
        schema={{ sections: postSections }}
        onSubmit={async (v) => {
          await postTxn.mutateAsync({
            accountId: v.accountId, type: v.type, channel: v.channel,
            amountCents: v.amount ?? 0, narration: v.narration || undefined, externalRef: v.externalRef || undefined,
          });
        }}
        submitLabel="Post transaction" />

      <FormModal open={productOpen} onOpenChange={setProductOpen} icon={Boxes} title="New savings product"
        subtitle="Products marked public appear on the landing page with these live terms."
        schema={{ sections: productSections }}
        onSubmit={async (v) => {
          await productMut.mutateAsync({
            code: v.code, name: v.name, type: v.type, description: v.description || undefined,
            interestRateBps: Math.round((Number(v.interestRateBps ?? 0)) * 100),
            minBalanceCents: v.minBalance ?? 0, minOpeningCents: v.minOpening ?? 0, monthlyFeeCents: v.monthlyFee ?? 0,
            withdrawalPolicy: v.withdrawalPolicy ?? 'FREE',
            withdrawalPenaltyBps: Math.round(Number(v.withdrawalPenaltyBps ?? 0) * 100),
            lockInMonths: Number(v.lockInMonths ?? 0),
            maturityTermsMonths: v.maturityTermsMonths ? Number(v.maturityTermsMonths) : undefined,
            isDefault: Boolean(v.isDefault), isPublic: v.isPublic !== false, active: v.active !== false,
            sortOrder: Number(v.sortOrder ?? 10),
          });
        }}
        submitLabel="Create product" />

      <FormModal open={orderOpen} onOpenChange={setOrderOpen} icon={CalendarClock} title="New standing order"
        subtitle="Runs monthly on the chosen day; 3 consecutive failures auto-suspend."
        schema={{ sections: orderSections }}
        onSubmit={async (v) => {
          await orderMut.mutateAsync({
            memberProfileId: v.memberProfileId, fromAccountId: v.fromAccountId,
            destinationType: v.destinationType, toAccountId: v.toAccountId || null,
            bankInstruction: v.bankInstruction || null,
            amountCents: v.amount ?? 0, dayOfMonth: Number(v.dayOfMonth ?? 1),
          });
        }}
        submitLabel="Create order" />

      <ConfirmDialog
        open={Boolean(reverse)}
        onOpenChange={() => setReverse(null)}
        title={`Reverse ${reverse?.reference}?`}
        description="A contra entry is posted (immutable ledger); the original row is marked REVERSED."
        confirmLabel="Reverse"
        danger
        onConfirm={async () => { if (reverse) await reverseMut.mutateAsync({ id: reverse.id, reason: 'Office correction' }); }}
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
