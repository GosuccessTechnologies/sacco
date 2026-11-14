'use client';
// Loans — applications workflow, portfolio, arrears, products (guide §10.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Banknote, UserCheck, CheckCircle2, XCircle, Send, Boxes, Undo2, Calculator, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtMoneyPlain, fmtBps, fmtDate, fmtDateTime, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function LoansPage() {
  const qc = useQueryClient();
  const { can, user } = usePermission();
  const [tab, setTab] = React.useState('applications');
  const [action, setAction] = React.useState<{ id: string; kind: string; label: string; number: string; amount?: number } | null>(null);
  const [note, setNote] = React.useState('');
  const [guarantorOpen, setGuarantorOpen] = React.useState<string | null>(null);
  const [repayOpen, setRepayOpen] = React.useState<string | null>(null);
  const [productOpen, setProductOpen] = React.useState(false);
  const [loanDetail, setLoanDetail] = React.useState<any>(null);

  const applications = useQuery({ queryKey: ['loan-apps'], queryFn: async () => (await fetch('/api/loans/applications')).json() });
  const loans = useQuery({ queryKey: ['loans'], queryFn: async () => (await fetch('/api/loans')).json() });
  const arrears = useQuery({ queryKey: ['arrears'], queryFn: async () => (await fetch('/api/loans/arrears')).json() });
  const products = useQuery({ queryKey: ['loan-products'], queryFn: async () => (await fetch('/api/loans/products')).json() });
  const members = useQuery({ queryKey: ['members'], queryFn: async () => (await fetch('/api/members')).json() });
  const savingsAccounts = useQuery({ queryKey: ['savings-accounts'], queryFn: async () => (await fetch('/api/savings/accounts')).json() });

  const appAction = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await fetch(`/api/loans/applications/${id}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ['loan-apps'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      const kind = vars.payload.action;
      const msgs: Record<string, string> = {
        invite_guarantor: 'Guarantor invited by email + SMS with portal link',
        record_manual_guarantor: 'Manual consent recorded',
        vet: `Scorecard computed — recommendation: ${data.recommendation}`,
        approve: 'Approved — member notified; ready to disburse',
        reject: 'Rejected — member notified',
        cancel: 'Cancelled',
        disburse: `Disbursed — loan ${data.loanNumber}; net ${fmtMoneyPlain(data.net)} after fees`,
      };
      toast({ title: msgs[kind] ?? 'Done' });
    },
    onError: (e: Error) => toast({ title: 'Action failed', description: e.message, variant: 'destructive' }),
  });

  const loanAction = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await fetch(`/api/loans/${id}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['arrears'] });
      toast({ title: `Loan action complete (${vars.payload.type})` });
    },
    onError: (e: Error) => toast({ title: 'Action failed', description: e.message, variant: 'destructive' }),
  });

  const repayMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/loans/${payload.loanId}/repayments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Repayment posted', description: data.closed ? 'Loan fully settled & guarantor holds released!' : `Outstanding now ${fmtMoneyPlain(data.newOutstanding)}` });
    },
    onError: (e: Error) => toast({ title: 'Repayment rejected', description: e.message, variant: 'destructive' }),
  });

  // ---------------------------------------------------------------- columns
  const appColumns: ColumnSpec<any>[] = [
    { key: 'applicationNumber', header: 'Ref', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'product', header: 'Product', type: 'text', defaultVisible: true },
    { key: 'requestedAmountCents', header: 'Requested (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'rate', header: 'Rate', type: 'text', hideOnExport: true },
    { key: 'method', header: 'Method', type: 'text' },
    { key: 'termMonths', header: 'Term (months)', type: 'number' },
    { key: 'purpose', header: 'Purpose', type: 'text' },
    { key: 'requestedBy', header: 'Origin', type: 'badge' },
    { key: 'appliedAt', header: 'Applied', type: 'datetime' },
    { key: 'approvedAmountCents', header: 'Approved (KES)', type: 'money' },
  ];

  const portfolioColumns: ColumnSpec<any>[] = [
    { key: 'loanNumber', header: 'Loan', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'product', header: 'Product', type: 'text', defaultVisible: true },
    { key: 'outstandingCents', header: 'Outstanding (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'nextDueAt', header: 'Next due', type: 'date' },
    { key: 'overdueDays', header: 'Days late', type: 'number' },
    { key: 'principalCents', header: 'Principal', type: 'money' },
    { key: 'netDisbursedCents', header: 'Net disbursed', type: 'money' },
    { key: 'feesChargedCents', header: 'Fees charged', type: 'money' },
    { key: 'penaltyAccruedCents', header: 'Penalties', type: 'money' },
    { key: 'installments', header: 'Installments', type: 'number' },
    { key: 'repayments', header: 'Repayments', type: 'number' },
    { key: 'channel', header: 'Disbursed via', type: 'badge' },
    { key: 'disbursedAt', header: 'Disbursed', type: 'date' },
    { key: 'applicationNumber', header: 'Application', type: 'text' },
  ];

  const arrearsColumns: ColumnSpec<any>[] = [
    { key: 'loanNumber', header: 'Loan', type: 'text', defaultVisible: true },
    { key: 'member', header: 'Member', type: 'text', defaultVisible: true },
    { key: 'bucket', header: 'Aging bucket', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'daysInArrears', header: 'Days late', type: 'number', defaultVisible: true },
    { key: 'overdueCents', header: 'Overdue (KES)', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'penaltyAccruedCents', header: 'Penalties', type: 'money' },
    { key: 'missedInstallments', header: 'Missed', type: 'number' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'outstandingCents', header: 'Outstanding', type: 'money' },
    { key: 'status', header: 'Status', type: 'badge' },
  ];

  const productColumns: ColumnSpec<any>[] = [
    { key: 'code', header: 'Code', type: 'text', defaultVisible: true },
    { key: 'name', header: 'Product', type: 'text', defaultVisible: true },
    { key: 'rateBps', header: 'Rate', type: 'text', defaultVisible: true },
    { key: 'method', header: 'Interest method', type: 'badge', defaultVisible: true },
    { key: 'savingsMultiplier', header: 'Savings multiple', type: 'number' },
    { key: 'minAmountCents', header: 'Min amount', type: 'money' },
    { key: 'maxAmountCents', header: 'Max amount', type: 'money' },
    { key: 'termMinMonths', header: 'Min term', type: 'number' },
    { key: 'termMaxMonths', header: 'Max term', type: 'number' },
    { key: 'requiredGuarantors', header: 'Guarantors', type: 'number' },
    { key: 'processingFeeBps', header: 'Processing fee', type: 'text' },
    { key: 'penaltyPerDayBps', header: 'Daily penalty', type: 'text' },
    { key: 'isPublic', header: 'On website', type: 'bool' },
    { key: 'active', header: 'Active', type: 'bool' },
  ];

  // ---------------------------------------------------------------- helpers
  const appRowActions = [
    {
      label: 'Guarantors', icon: UserCheck, color: 'extra' as const,
      show: (r: any) => ['GUARANTOR_PENDING', 'SUBMITTED'].includes(r.status),
      onClick: (r: any) => setGuarantorOpen(r.id),
    },
    {
      label: 'Vet', icon: Calculator, color: 'view' as const,
      show: (r: any) => can('loans_vet') && ['GUARANTOR_PENDING', 'VETTING'].includes(r.status) && r.guarantors.filter((g: any) => g.status === 'ACCEPTED' || g.status === 'MANUAL_RECORDED').length >= 1,
      onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'vet', label: 'Vet this application (scorecard)', number: r.applicationNumber }); },
    },
    {
      label: 'Approve', icon: CheckCircle2, color: 'approve' as const,
      show: (r: any) => can('loans_approve_b1') && r.status === 'VETTING',
      onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'approve', label: 'Approve loan', number: r.applicationNumber, amount: r.requestedAmountCents }); },
    },
    {
      label: 'Disburse', icon: Send, color: 'primary' as const,
      show: (r: any) => can('loans_disburse') && r.status === 'APPROVED' && !r.loan,
      onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'disburse', label: 'Disburse loan', number: r.applicationNumber, amount: r.approvedAmountCents ?? r.requestedAmountCents }); },
    },
    {
      label: 'Reject', icon: XCircle, color: 'reject' as const,
      show: (r: any) => can('loans_vet') && ['SUBMITTED', 'GUARANTOR_PENDING', 'VETTING'].includes(r.status),
      onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'reject', label: 'Reject application', number: r.applicationNumber }); },
    },
  ];

  const selectedApp = (applications.data ?? []).find((a: any) => a.id === guarantorOpen);
  const guarantorSections: SectionDef[] = [
    {
      title: 'Invite guarantor', icon: UserCheck, description: 'Eligibility: ACTIVE member, KYC verified, within exposure cap. Invitation goes out by email + SMS.',
      fields: [
        { name: 'guarantorMemberId', label: 'Guarantor member', type: 'select', required: true, options: (members.data ?? []).filter((m: any) => m.status === 'ACTIVE' && m.kycVerified).map((m: any) => ({ value: m.id, label: `${m.name} (${m.memberNumber})` })) },
        { name: 'guaranteedAmount', label: 'Guarantee amount (KES)', type: 'money', required: true },
      ],
    },
  ];

  const repaySections: SectionDef[] = [
    {
      title: 'Record repayment', icon: Banknote,
      fields: [
        { name: 'amount', label: 'Amount (KES)', type: 'money', required: true },
        { name: 'channel', label: 'Channel', type: 'select', required: true, options: [
          { value: 'COUNTER', label: 'Counter cash' }, { value: 'MPESA', label: 'M-Pesa' }, { value: 'PAYROLL', label: 'Payroll deduction' }, { value: 'PORTAL', label: 'From savings (portal)' },
        ] },
        { name: 'externalRef', label: 'External reference' },
        { name: 'narration', label: 'Narration' },
      ],
    },
  ];

  const productSections: SectionDef[] = [
    {
      title: 'Product terms', icon: Boxes,
      fields: [
        { name: 'code', label: 'Code', required: true },
        { name: 'name', label: 'Name', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'interestMethod', label: 'Interest method', type: 'select', required: true, options: [{ value: 'REDUCING', label: 'Reducing balance (annuity)' }, { value: 'FLAT', label: 'Flat rate' }] },
        { name: 'rate', label: 'Interest (% p.a.)', type: 'money', required: true },
        { name: 'penaltyPerDayBps', label: 'Daily penalty (%)', type: 'money' },
      ],
    },
    {
      title: 'Limits', cols: 2,
      fields: [
        { name: 'savingsMultiplier', label: 'Savings multiple (x)', type: 'number', required: true, defaultValue: 3 },
        { name: 'requiredGuarantors', label: 'Guarantors required', type: 'number', required: true, defaultValue: 2 },
        { name: 'minAmount', label: 'Min amount (KES)', type: 'money', required: true },
        { name: 'maxAmount', label: 'Max amount (KES)', type: 'money', required: true },
        { name: 'termMinMonths', label: 'Min term (months)', type: 'number', required: true, defaultValue: 6 },
        { name: 'termMaxMonths', label: 'Max term (months)', type: 'number', required: true, defaultValue: 36 },
        { name: 'guaranteeCoveragePct', label: 'Coverage per guarantor (%)', type: 'number', defaultValue: 20 },
        { name: 'gracePeriodDays', label: 'Grace period (days)', type: 'number', defaultValue: 0 },
      ],
    },
    {
      title: 'Fees & visibility', cols: 2,
      fields: [
        { name: 'processingFeeBps', label: 'Processing fee (%)', type: 'money' },
        { name: 'insuranceFeeBps', label: 'Insurance fee (%)', type: 'money' },
        { name: 'isPublic', label: 'Show on public website', type: 'switch', defaultValue: true },
        { name: 'active', label: 'Active', type: 'switch', defaultValue: true },
      ],
    },
  ];

  return (
    <>
      <PageHeader icon={Landmark} title="Loan Portfolio & Credit" description="Applications with guarantorship & multi-level approvals, amortized portfolio, arrears engine." actions={can('loans_products') ? <Button2 onClick={() => setProductOpen(true)} icon={Boxes} label="New product" primary /> : undefined} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="arrears">Arrears</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="mb-3 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--t-border)', background: 'var(--t-table-header-a)', color: 'var(--t-muted-text)' }}>
            Pipeline: <strong>SUBMITTED → GUARANTOR_PENDING → VETTING → APPROVED → DISBURSED</strong>. Band approvals: ≤50k officer+manager · ≤200k + accountant · &gt;200k + super admin. Every transition notifies the member by email + SMS.
          </div>
          <DataTable
            id="loan-apps"
            title="Loan applications"
            subtitle="Digital applications — member self-service or admin on behalf"
            data={applications.data ?? []}
            columns={appColumns}
            actions={appRowActions}
            searchKeys={['applicationNumber', 'member', 'product']}
            exportPermission="loans_export"
            emptyMessage={applications.isLoading ? 'Loading…' : 'No applications yet.'}
          />
          {selectedApp && (
            <div className="dsms-pop public-card section-pad mt-4">
              <h3 className="mb-3 text-sm font-bold">Guarantor checklist — {selectedApp.applicationNumber}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedApp.guarantors.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--t-border)' }}>
                    <div>
                      <p className="text-sm font-semibold">{g.name}</p>
                      <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Guarantee: {fmtMoneyPlain(g.amountCents)} · method {g.method} · expires {fmtDate(g.expiresAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={badgeClass[statusBadge(g.status).tone]}>{statusBadge(g.status).label}</Badge>
                      {g.status === 'PENDING' && can('loans_vet') && (
                        <Button size="sm" variant="outline" onClick={() => appAction.mutateAsync({ id: selectedApp.id, payload: { action: 'record_manual_guarantor', guarantorId: g.id } })}>
                          Record manual consent
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!selectedApp.guarantors.length && <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No guarantors invited yet.</p>}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="portfolio">
          <DataTable
            id="loans-portfolio"
            title="Loan portfolio"
            subtitle="Amortized loans with outstanding balances"
            data={loans.data ?? []}
            columns={portfolioColumns}
            stats
            searchKeys={['loanNumber', 'member', 'product']}
            exportPermission="loans_export"
            actions={[
              { label: 'Schedule', icon: FileSpreadsheet, color: 'view', onClick: (r: any) => loadLoanDetail(r.id) },
              ...(can('loans_repay_post') ? [{ label: 'Repay', icon: Banknote, color: 'approve', show: (r: any) => r.outstandingCents > 0 && r.status !== 'WRITTEN_OFF', onClick: (r: any) => setRepayOpen(r.id) }] : []),
              ...(can('loans_actions') ? [
                { label: 'Reschedule', icon: Undo2, color: 'extra', show: (r: any) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(r.status), onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'RESCHEDULE', label: 'Reschedule loan', number: r.loanNumber }); } },
                { label: 'Waive penalties', icon: CheckCircle2, color: 'approve', show: (r: any) => r.penaltyAccruedCents > 0, onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'WAIVER', label: 'Waive penalties', number: r.loanNumber }); } },
                { label: 'Write off', icon: XCircle, color: 'delete', show: (r: any) => r.outstandingCents > 0 && r.status !== 'WRITTEN_OFF', onClick: (r: any) => { setNote(''); setAction({ id: r.id, kind: 'WRITE_OFF', label: 'Write off loan', number: r.loanNumber }); } },
              ] : []),
            ]}
          />
          {loanDetail && (
            <div className="dsms-pop public-card section-pad mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Amortization — {loanDetail.loanNumber} ({loanDetail.member})</h3>
                <Button2 onClick={() => setLoanDetail(null)} label="Close" />
              </div>
              <div className="dsms-table-wrap">
                <table className="dsms-table">
                  <thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Total due</th><th>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {loanDetail.schedule.map((s: any) => (
                      <tr key={s.id}>
                        <td style={{ textAlign: 'center' }}>{s.installmentNo}</td>
                        <td>{fmtDate(s.dueDate)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.principalDueCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.interestDueCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.penaltyDueCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.totalDueCents)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(s.paidCents)}</td>
                        <td><Badge className={badgeClass[statusBadge(s.status).tone]}>{statusBadge(s.status).label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <Progress value={Math.round(((loanDetail.principalCents - loanDetail.outstandingCents) / loanDetail.principalCents) * 100)} className="h-2" />
                <p className="mt-1 text-xs" style={{ color: 'var(--t-muted-text)' }}>
                  Cleared {fmtMoneyPlain(loanDetail.principalCents - loanDetail.outstandingCents)} of {fmtMoneyPlain(loanDetail.principalCents)} principal.
                  Guarantor holds release automatically on settlement.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="arrears">
          <DataTable
            id="loans-arrears"
            title="Arrears & collections"
            subtitle="Aging buckets refreshed by the daily job; penalties accrue per product terms"
            data={arrears.data ?? []}
            columns={arrearsColumns}
            stats
            searchKeys={['loanNumber', 'member']}
            exportPermission="loans_export"
            emptyMessage="No arrears — the book is clean."
          />
        </TabsContent>

        <TabsContent value="products">
          <DataTable
            id="loan-products"
            title="Loan products"
            subtitle="Terms per product — changes apply to future applications"
            data={(products.data ?? []).map((p: any) => ({ ...p, rateBps: fmtBps(p.interestRateBps), processingFeeBps: fmtBps(p.processingFeeBps), penaltyPerDayBps: fmtBps(p.penaltyPerDayBps) }))}
            columns={productColumns}
            searchKeys={['code', 'name']}
          />
        </TabsContent>
      </Tabs>

      {/* guarantor invite modal */}
      <FormModal open={Boolean(guarantorOpen)} onOpenChange={(o) => !o && setGuarantorOpen(null)} icon={UserCheck}
        title="Invite guarantor" subtitle="Eligibility is validated live (status, KYC, exposure cap, open guarantees)."
        schema={{ sections: guarantorSections }}
        onSubmit={async (v) => {
          await appAction.mutateAsync({ id: guarantorOpen!, payload: { action: 'invite_guarantor', guarantorMemberId: v.guarantorMemberId, guaranteedAmountCents: v.guaranteedAmount ?? 0 } });
          setGuarantorOpen(null);
        }}
        submitLabel="Send invitation" />

      {/* repayment modal */}
      <FormModal open={Boolean(repayOpen)} onOpenChange={(o) => !o && setRepayOpen(null)} icon={Banknote}
        title="Record loan repayment" subtitle="Waterfall allocation: penalties → interest → principal (oldest installment first)."
        schema={{ sections: repaySections }}
        onSubmit={async (v) => {
          await repayMut.mutateAsync({ loanId: repayOpen, amountCents: v.amount ?? 0, channel: v.channel, externalRef: v.externalRef || undefined, narration: v.narration || undefined });
          setRepayOpen(null);
        }}
        submitLabel="Post repayment" />

      {/* product modal */}
      <FormModal open={productOpen} onOpenChange={setProductOpen} icon={Boxes} title="New loan product"
        subtitle="Terms apply to future applications; amortization is generated at disbursement."
        schema={{ sections: productSections }}
        onSubmit={async (v) => {
          const res = await fetch('/api/loans/products', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: v.code, name: v.name, description: v.description || undefined,
              interestMethod: v.interestMethod, interestRateBps: Math.round(Number(v.rate ?? 0) * 100),
              penaltyPerDayBps: Math.round(Number(v.penaltyPerDayBps ?? 0) * 100),
              termMinMonths: Number(v.termMinMonths ?? 6), termMaxMonths: Number(v.termMaxMonths ?? 36),
              minAmountCents: v.minAmount ?? 0, maxAmountCents: v.maxAmount ?? 0,
              savingsMultiplier: Number(v.savingsMultiplier ?? 3), requiredGuarantors: Number(v.requiredGuarantors ?? 2),
              guaranteeCoveragePct: Number(v.guaranteeCoveragePct ?? 20), gracePeriodDays: Number(v.gracePeriodDays ?? 0),
              processingFeeBps: Math.round(Number(v.processingFeeBps ?? 0) * 100),
              insuranceFeeBps: Math.round(Number(v.insuranceFeeBps ?? 0) * 100),
              isPublic: v.isPublic !== false, active: v.active !== false,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Failed');
          qc.invalidateQueries({ queryKey: ['loan-products'] });
          toast({ title: 'Product created' });
        }}
        submitLabel="Create product" />

      {/* decision modal */}
      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={() => setAction(null)}
        title={action?.label ?? ''}
        description={
          action?.kind === 'approve'
            ? `Approving ${fmtMoneyPlain(action?.amount ?? 0)}. Band check enforced server-side; approval trail recorded.`
            : action?.kind === 'disburse'
            ? `Net amount is principal minus processing + insurance fees. Channel GL posts atomically; guarantor funds are held.`
            : action?.kind === 'WRITE_OFF'
            ? 'Outstanding moves to write-off expense (GL). Member cannot borrow until cleared by super admin.'
            : action?.kind === 'RESCHEDULE'
            ? 'A new schedule replaces the old one on the outstanding balance.'
            : action?.kind === 'WAIVER'
            ? 'Penalties are waived with a contra-income entry; principal is never waived.'
            : 'Recorded in the approval trail; member notified by email + SMS.'
        }
        confirmLabel={action?.kind === 'reject' || action?.kind === 'WRITE_OFF' ? action.kind === 'reject' ? 'Reject' : 'Write off' : 'Confirm'}
        danger={action?.kind === 'reject' || action?.kind === 'WRITE_OFF'}
        onConfirm={async () => {
          if (!action) return;
          if (action.kind === 'vet') await appAction.mutateAsync({ id: action.id, payload: { action: 'vet', notes: note || undefined } });
          else if (action.kind === 'approve') await appAction.mutateAsync({ id: action.id, payload: { action: 'approve', approvedAmountCents: action.amount } });
          else if (action.kind === 'reject') await appAction.mutateAsync({ id: action.id, payload: { action: 'reject', reason: note || 'Policy' } });
          else if (action.kind === 'disburse') await appAction.mutateAsync({ id: action.id, payload: { action: 'disburse', channel: 'BANK', channelRef: note || undefined } });
          else if (['RESCHEDULE', 'WAIVER', 'WRITE_OFF'].includes(action.kind)) {
            await loanAction.mutateAsync({
              id: action.id,
              payload: action.kind === 'RESCHEDULE'
                ? { type: 'RESCHEDULE', newTermMonths: 12, reason: note || 'Office reschedule' }
                : action.kind === 'WAIVER'
                ? { type: 'WAIVER', penaltyOnly: true, reason: note || 'Goodwill waiver' }
                : { type: 'WRITE_OFF', reason: note || 'Non-recovery' },
            });
          }
        }}
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={action?.kind === 'disburse' ? 'Bank/payment reference (optional)' : 'Notes / reason (recorded & sent where applicable)'} className="dsms-input h-10 w-full" aria-label="Notes" />
      </ConfirmDialog>
    </>
  );

  async function loadLoanDetail(id: string) {
    const res = await fetch(`/api/loans/${id}`);
    if (res.ok) setLoanDetail(await res.json());
  }
}

function Button2({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon?: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={onClick} className={primary ? 'bg-[var(--t-primary)] text-white hover:brightness-110' : ''}>
      {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
