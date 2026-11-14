'use client';
// Members directory + KYC + profile panel — guide §8.6.
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, RefreshCcw, BadgeCheck, Ban, ShieldCheck, Power, FileText } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { ConfirmDialog } from '@/components/kit/kit-bits';
import { toast } from '@/hooks/use-toast';
import { fmtMoneyPlain, fmtDate, statusBadge, badgeClass } from '@/lib/client-utils';
import { usePermission } from '@/hooks/use-permission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

export default function MembersPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [statusAction, setStatusAction] = React.useState<{ id: string; action: string; label: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => (await fetch('/api/members')).json(),
  });
  const { data: detail } = useQuery({
    queryKey: ['member', selectedId],
    queryFn: async () => (await fetch(`/api/members/${selectedId}`)).json(),
    enabled: Boolean(selectedId),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: string; reason?: string }) => {
      const res = await fetch(`/api/members/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Member status updated' }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['member'] }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const columns: ColumnSpec<any>[] = [
    { key: 'memberNumber', header: 'Member No', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'name', header: 'Name', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'phone', header: 'Phone', type: 'text', defaultVisible: true },
    { key: 'email', header: 'Email', type: 'text' },
    { key: 'nationalId', header: 'National ID', type: 'text' },
    { key: 'shares', header: 'Shares', type: 'number' },
    { key: 'savingsAccounts', header: 'Accounts', type: 'number' },
    { key: 'openLoans', header: 'Open loans', type: 'number' },
    { key: 'kycVerified', header: 'KYC', type: 'bool' },
    { key: 'portalStatus', header: 'Portal', type: 'badge' },
    { key: 'joinedAt', header: 'Joined', type: 'date' },
  ];

  const actions = [
    { label: 'View', icon: FileText, color: 'view' as const, onClick: (r: any) => setSelectedId(r.id) },
    ...(can('members_kyc_verify') ? [{ label: 'KYC', icon: BadgeCheck, color: 'approve' as const, onClick: (r: any) => setStatusAction({ id: r.id, action: 'kyc_verify', label: 'Verify KYC' }), show: (r: any) => !r.kycVerified && r.status === 'ACTIVE' }] : []),
    ...(can('members_status') ? [
      { label: 'Suspend', icon: Ban, color: 'reject' as const, onClick: (r: any) => setStatusAction({ id: r.id, action: 'suspend', label: 'Suspend member' }), show: (r: any) => r.status === 'ACTIVE' },
      { label: 'Reactivate', icon: Power, color: 'approve' as const, onClick: (r: any) => setStatusAction({ id: r.id, action: 'reactivate', label: 'Reactivate member' }), show: (r: any) => ['SUSPENDED', 'BLACKLISTED'].includes(r.status) },
    ] : []),
  ];

  const createSections: SectionDef[] = [
    {
      title: 'Bio data', icon: Users,
      fields: [
        { name: 'firstName', label: 'First name', required: true },
        { name: 'middleName', label: 'Middle name' },
        { name: 'lastName', label: 'Last name', required: true },
        { name: 'gender', label: 'Gender', type: 'select', required: true, options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }] },
        { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
        { name: 'nationalId', label: 'National ID', required: true, placeholder: '8 digits' },
        { name: 'passportNo', label: 'Passport No' },
        { name: 'kraPin', label: 'KRA PIN' },
      ],
    },
    {
      title: 'Contact & work', cols: 2,
      fields: [
        { name: 'phone', label: 'Phone', required: true, placeholder: '+2547…' },
        { name: 'email', label: 'Email (portal login)', type: 'email', required: true },
        { name: 'physicalAddress', label: 'Physical address', required: true },
        { name: 'town', label: 'Town' },
        { name: 'county', label: 'County' },
        { name: 'occupation', label: 'Occupation' },
        { name: 'employerName', label: 'Employer' },
        { name: 'monthlyIncome', label: 'Monthly income (KES)', type: 'money' },
      ],
    },
    {
      title: 'Next of kin', cols: 2, description: 'At least one is required before any loan application.',
      fields: [
        { name: 'kinName', label: 'Kin name', required: true },
        { name: 'kinRelationship', label: 'Relationship', required: true, placeholder: 'Spouse / Sibling / Parent' },
        { name: 'kinPhone', label: 'Kin phone', required: true },
        { name: 'kinId', label: 'Kin ID' },
      ],
    },
    {
      title: 'Portal account',
      fields: [
        { name: 'createPortalAccount', label: 'Create portal login (temp password emailed)', type: 'switch', defaultValue: true },
      ],
    },
  ];

  async function createMember(values: Record<string, unknown>) {
    const res = await fetch('/api/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: values.firstName, middleName: values.middleName || null, lastName: values.lastName,
        gender: values.gender, dateOfBirth: values.dateOfBirth, nationalId: values.nationalId,
        passportNo: values.passportNo || null, kraPin: values.kraPin || null,
        phone: values.phone, email: values.email, physicalAddress: values.physicalAddress,
        town: values.town || null, county: values.county || null,
        occupation: values.occupation || null, employerName: values.employerName || null,
        monthlyIncomeCents: values.monthlyIncome ?? 0,
        nextOfKins: [{ name: values.kinName, relationship: values.kinRelationship, phone: values.kinPhone, idNumber: values.kinId || null, percentage: 100 }],
        createPortalAccount: values.createPortalAccount !== false,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Creation failed');
    qc.invalidateQueries({ queryKey: ['members'] });
    if (data.tempPassword) toast({ title: `Member ${data.memberNumber} created`, description: `Main savings account ${data.accountCreated ? 'opened' : 'pending'}. Temp password: ${data.tempPassword} (also emailed)` });
    else toast({ title: `Member ${data.memberNumber} created` });
  }

  return (
    <>
      <PageHeader
        icon={Users}
        title="Member Management"
        description="KYC directory, portal controls and member lifecycle."
        actions={
          <>
            <Button2 onClick={() => qc.invalidateQueries({ queryKey: ['members'] })} icon={RefreshCcw} label="Refresh" />
            {can('members_create') && <Button2 onClick={() => setCreateOpen(true)} icon={UserPlus} label="New member" primary />}
          </>
        }
      />
      <DataTable
        id="members-dir"
        title="Members directory"
        subtitle="Registry of all members"
        data={rows}
        columns={columns}
        actions={actions}
        searchKeys={['memberNumber', 'name', 'phone', 'nationalId', 'email']}
        exportPermission="members_export"
        emptyMessage={isLoading ? 'Loading members…' : 'No members yet — create one or approve an application.'}
      />

      {selectedId && detail && (
        <ProfilePanel detail={detail} onClose={() => setSelectedId(null)} onStatus={(action: string, label?: string) => setStatusAction({ id: selectedId, action, label: label ?? action })} canStatus={can('members_status')} canKyc={can('members_kyc_verify')} />
      )}

      <FormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        icon={UserPlus}
        title="Register new member"
        subtitle="Creates the profile, portal login and main savings account in one atomic transaction."
        schema={{ sections: createSections }}
        onSubmit={createMember}
        submitLabel="Create member"
      />

      <ConfirmDialog
        open={Boolean(statusAction)}
        onOpenChange={() => setStatusAction(null)}
        title={statusAction?.label ?? ''}
        description="This action is recorded in the audit trail. The member is notified where applicable."
        confirmLabel="Confirm"
        danger={['suspend', 'exit'].includes(statusAction?.action ?? '')}
        onConfirm={async () => {
          if (!statusAction) return;
          await statusMutation.mutateAsync({ id: statusAction.id, action: statusAction.action, reason: 'Office action' });
        }}
      />
    </>
  );
}

function ProfilePanel({ detail, onClose, onStatus, canStatus, canKyc }: any) {
  const sb = (s: string) => statusBadge(s);
  return (
    <div className="dsms-pop public-card section-pad mt-4" aria-label="Member profile">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="card-hero grid h-14 w-14 place-items-center rounded-2xl text-lg font-black">
            {`${detail.firstName?.[0] ?? ''}${detail.lastName?.[0] ?? ''}`}
          </span>
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>
              {detail.firstName} {detail.middleName ?? ''} {detail.lastName}
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--t-muted-text)' }}>{detail.memberNumber}</span>
            </h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge className={badgeClass[sb(detail.status).tone]}>{sb(detail.status).label}</Badge>
              <Badge variant="outline">{detail.kycVerified ? 'KYC verified' : 'KYC pending'}</Badge>
              {detail.sharePosition && <Badge variant="outline">{detail.sharePosition.totalShares} shares</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canKyc && !detail.kycVerified && <Button2 onClick={() => onStatus('kyc_verify', 'Verify KYC')} icon={BadgeCheck} label="Verify KYC" primary />}
          {canStatus && detail.status === 'ACTIVE' && <Button2 onClick={() => onStatus('suspend', 'Suspend member')} icon={Ban} label="Suspend" />}
          {canStatus && detail.status === 'SUSPENDED' && <Button2 onClick={() => onStatus('reactivate', 'Reactivate')} icon={Power} label="Reactivate" />}
          <Button2 onClick={onClose} label="Close" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Identity</h3>
          <dl className="space-y-1.5 text-sm">
            <Row k="National ID" v={detail.nationalId} />
            <Row k="Phone" v={detail.phone} />
            <Row k="Email" v={detail.email ?? detail.user?.email ?? '—'} />
            <Row k="Address" v={`${detail.physicalAddress}, ${detail.town ?? ''} ${detail.county ?? ''}`} />
            <Row k="Occupation" v={detail.occupation ?? '—'} />
            <Row k="Joined" v={fmtDate(detail.joinedAt)} />
          </dl>
          <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Next of kin / beneficiaries</h3>
          {detail.nextOfKins?.map((k: any) => (
            <p key={k.id} className="text-sm">{k.name} — {k.relationship} · {k.phone}{k.percentage ? ` · ${k.percentage}%` : ''}</p>
          ))}
          {detail.beneficiaries?.map((b: any) => (
            <p key={b.id} className="text-sm">{b.name} — {b.relationship} · {b.allocationPct}%</p>
          ))}
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Savings accounts</h3>
          {detail.savingsAccounts?.map((a: any) => (
            <div key={a.id} className="mb-2 rounded-lg p-2" style={{ background: 'var(--t-table-header-a)' }}>
              <p className="text-sm font-semibold">{a.accountNumber} — {a.product.name}</p>
              <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>
                Balance: <strong style={{ color: 'var(--t-text)' }}>KES {fmtMoneyPlain(a.balanceCents)}</strong>
                {a.heldFundsCents > 0 && <> · hold: {fmtMoneyPlain(a.heldFundsCents)}</>}
                {' · '}<Badge className={badgeClass[statusBadge(a.status).tone]}>{a.status}</Badge>
              </p>
            </div>
          ))}
          <h3 className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Loans</h3>
          {detail.loans?.length ? detail.loans.map((l: any) => (
            <p key={l.id} className="text-sm">{l.loanNumber} — {l.product.name} · outstanding {fmtMoneyPlain(l.outstandingCents)} · <Badge className={badgeClass[statusBadge(l.status).tone]}>{statusBadge(l.status).label}</Badge></p>
          )) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>No loans.</p>}
          <h3 className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Guarantorships</h3>
          {detail.guarantorships?.length ? detail.guarantorships.map((g: any) => (
            <p key={g.id} className="text-sm">{g.application.applicationNumber} — {fmtMoneyPlain(g.guaranteedAmountCents)} · <Badge className={badgeClass[statusBadge(g.status).tone]}>{statusBadge(g.status).label}</Badge></p>
          )) : <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>None.</p>}
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t-muted-text)' }}>Portal & audit</h3>
          <dl className="space-y-1.5 text-sm">
            <Row k="Portal user" v={detail.user ? detail.user.email : 'Not provisioned'} />
            <Row k="Portal status" v={detail.user?.status ?? '—'} />
            <Row k="Last login" v={fmtDate(detail.user?.lastLoginAt)} />
            <Row k="Must change pwd" v={detail.user?.mustChangePassword ? 'Yes' : 'No'} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-xs font-semibold" style={{ color: 'var(--t-muted-text)' }}>{k}</dt>
      <dd className="max-w-[60%] truncate text-right text-sm">{v ?? '—'}</dd>
    </div>
  );
}

function Button2({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon?: LucideIcon; label: string; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? 'default' : 'outline'} onClick={onClick}
            className={primary ? 'bg-[var(--t-primary)] text-white hover:brightness-110' : ''}>
      {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
