'use client';
// Administration — users, RBAC matrix, audit, HR & payroll, settings hub
// (entity, website, features, themes, letterheads, integrations, cache, files) — guide §17.6.
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, UserPlus, KeyRound, Eye, Pencil, Users2, Grid3x3, ScrollText, Briefcase,
  Building2, Palette, FileText, Plug, Trash2, Gauge, FolderOpen, Save, Upload, Sun, Snowflake,
} from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { toast } from '@/hooks/use-toast';
import { usePermission, useCurrentUser } from '@/hooks/use-permission';
import { fmtDateTime, fmtDate, fmtMoneyPlain, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AdministrationPage() {
  const qc = useQueryClient();
  const { can, user } = usePermission();
  const me = useCurrentUser();
  const [tab, setTab] = React.useState('users');
  const [userOpen, setUserOpen] = React.useState(false);
  const [resetFor, setResetFor] = React.useState<any | null>(null);
  const [impersonateFor, setImpersonateFor] = React.useState<any | null>(null);
  const [impersonateReason, setImpersonateReason] = React.useState('');

  const users = useQuery({ queryKey: ['users'], queryFn: async () => (await fetch('/api/users')).json() });
  const rbac = useQuery({ queryKey: ['rbac'], queryFn: async () => (await fetch('/api/rbac/assignments')).json() });
  const auditLogs = useQuery({ queryKey: ['audit'], queryFn: async () => (await fetch('/api/audit')).json() });
  const hr = useQuery({ queryKey: ['hr'], queryFn: async () => (await fetch('/api/hr/staff')).json() });
  const payroll = useQuery({ queryKey: ['payroll'], queryFn: async () => (await fetch('/api/payroll/runs')).json() });
  const settings = useQuery({ queryKey: ['settings'], queryFn: async () => (await fetch('/api/settings/entity')).json() });
  const themes = useQuery({ queryKey: ['themes'], queryFn: async () => (await fetch('/api/themes')).json() });
  const letterheads = useQuery({ queryKey: ['letterheads'], queryFn: async () => (await fetch('/api/letterheads')).json() });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: async () => (await fetch('/api/integrations')).json() });
  const files = useQuery({ queryKey: ['file-manager'], queryFn: async () => (await fetch('/api/files/list')).json() });
  const cache = useQuery({ queryKey: ['cache'], queryFn: async () => (await fetch('/api/cache/clear')).json() });

  const genericMut = useMutation({
    mutationFn: async ({ endpoint, payload, method }: { endpoint: string; payload?: any; method?: string }) => {
      const res = await fetch(endpoint, { method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  // ---------------------------------------------------------- users table
  const userColumns: ColumnSpec<any>[] = [
    { key: 'name', header: 'Name', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'email', header: 'Email', type: 'text', defaultVisible: true },
    { key: 'role', header: 'Role', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'designation', header: 'Designation', type: 'text', defaultVisible: true, filter: 'select' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'phone', header: 'Phone', type: 'text' },
    { key: 'memberNumber', header: 'Member No', type: 'text' },
    { key: 'staffNo', header: 'Staff No', type: 'text' },
    { key: 'lastLoginAt', header: 'Last login', type: 'datetime' },
    { key: 'lockedUntil', header: 'Locked until', type: 'datetime' },
    { key: 'mustChangePassword', header: 'Must change pwd', type: 'bool' },
  ];

  const userSections: SectionDef[] = [
    {
      title: 'New user', icon: UserPlus,
      fields: [
        { name: 'name', label: 'Full name', required: true },
        { name: 'email', label: 'Email (login)', type: 'email', required: true },
        { name: 'phone', label: 'Phone', placeholder: '+2547…' },
        { name: 'role', label: 'Role', type: 'select', required: true, options: [
          { value: 'ADMIN', label: 'Admin (staff)' }, { value: 'SUPER_ADMIN', label: 'Super admin' }, { value: 'MEMBER', label: 'Member' },
        ] },
        { name: 'designation', label: 'Designation (admins)', type: 'select', options: [
          { value: 'MANAGER', label: 'Manager' }, { value: 'TELLER', label: 'Teller' }, { value: 'LOAN_OFFICER', label: 'Loan officer' },
          { value: 'ACCOUNTANT', label: 'Accountant' }, { value: 'COMPLIANCE', label: 'Compliance' }, { value: 'RECEPTION', label: 'Reception' },
        ] },
      ],
    },
  ];

  return (
    <>
      <PageHeader icon={ShieldCheck} title="Administration, Security & HR" description="Users & RBAC, cross-login, audit trail, HR & payroll, and the full settings hub." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3 flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="rbac">Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
          <TabsTrigger value="hr">HR & Payroll</TabsTrigger>
          <TabsTrigger value="entity">Entity</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="letterheads">Letterheads</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <DataTable
            id="users"
            title="Users"
            subtitle="Exactly three roles — super admin, admin (with designations), member"
            data={users.data ?? []}
            columns={userColumns}
            searchKeys={['name', 'email']}
            toolbarExtra={can('users_manage') ? <Button2 onClick={() => setUserOpen(true)} icon={UserPlus} label="New user" primary /> : undefined}
            actions={[
              { label: 'Reset pwd', icon: KeyRound, color: 'extra', show: (r: any) => can('users_manage'), onClick: (r: any) => setResetFor(r) },
              { label: 'Cross-login', icon: Eye, color: 'view', show: (r: any) => can('users_impersonate') && r.id !== me?.actAsBy && r.role !== 'SUPER_ADMIN' && !r.actAs, onClick: (r: any) => { setImpersonateReason(''); setImpersonateFor(r); } },
              { label: 'Disable', icon: Pencil, color: 'delete', show: (r: any) => can('users_manage') && r.status === 'ACTIVE' && r.id !== me?.id, onClick: (r: any) => genericMut.mutate({ endpoint: '/api/users', method: 'PATCH', payload: { id: r.id, status: 'DISABLED' } }) },
              { label: 'Enable', icon: Pencil, color: 'approve', show: (r: any) => can('users_manage') && r.status !== 'ACTIVE', onClick: (r: any) => genericMut.mutate({ endpoint: '/api/users', method: 'PATCH', payload: { id: r.id, status: 'ACTIVE' } }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="rbac">
          <RbacMatrix data={rbac.data} canManage={can('rbac_manage')} onSave={(matrix: any) => genericMut.mutate({ endpoint: '/api/rbac/assignments', method: 'PUT', payload: { matrix } })} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTable data={auditLogs.data ?? []} />
        </TabsContent>

        <TabsContent value="hr">
          <HrPayroll hr={hr.data} payroll={payroll.data} canApprove={can('payroll_approve')} onGenerate={(id: string) => genericMut.mutate({ endpoint: `/api/payroll/runs/${id}/generate` })} onApprove={(id: string) => genericMut.mutate({ endpoint: `/api/payroll/runs/${id}/pay`, payload: { action: 'approve' } })} onPay={(id: string) => genericMut.mutate({ endpoint: `/api/payroll/runs/${id}/pay`, payload: { action: 'pay' } })} />
        </TabsContent>

        <TabsContent value="entity">
          <EntityForm data={settings.data} onSave={(payload: any) => genericMut.mutate({ endpoint: '/api/settings/entity', method: 'PUT', payload })} canEdit={can('settings_entity')} />
        </TabsContent>

        <TabsContent value="website">
          <WebsiteSettings onSave={(payload: any) => genericMut.mutate({ endpoint: '/api/settings/website', method: 'PUT', payload })} canEdit={can('settings_website')} />
        </TabsContent>

        <TabsContent value="features">
          <FeatureToggles onSave={(payload: any) => genericMut.mutate({ endpoint: '/api/settings/features', method: 'PUT', payload })} canEdit={can('settings_features')} />
        </TabsContent>

        <TabsContent value="themes">
          <ThemeGallery data={themes.data ?? []} canManage={can('settings_themes')} onApply={(id: string) => genericMut.mutate({ endpoint: `/api/themes/${id}/apply` })} />
        </TabsContent>

        <TabsContent value="letterheads">
          <LetterheadGallery data={letterheads.data ?? []} canManage={can('settings_letterheads')} onApply={(id: string) => genericMut.mutate({ endpoint: `/api/letterheads/${id}/apply` })} />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsPanel data={integrations.data ?? []} canManage={can('integrations_manage')} onSave={(provider: string, values: any, extra: any) => genericMut.mutate({ endpoint: `/api/integrations/${provider}`, method: 'PUT', payload: { values, ...extra } })} onTest={(provider: string) => genericMut.mutate({ endpoint: `/api/integrations/${provider}/test` })} />
        </TabsContent>

        <TabsContent value="files">
          <FileManager data={files.data} onDelete={(id: string) => genericMut.mutate({ endpoint: '/api/files/list', method: 'DELETE', payload: { id } })} canDelete={can('files_delete')} />
        </TabsContent>

        <TabsContent value="cache">
          <CachePanel data={cache.data} canManage={can('settings_cache')} onToggle={(enabled: boolean) => genericMut.mutate({ endpoint: '/api/cache/clear', payload: { action: 'toggle', enabled } })} onClear={() => genericMut.mutate({ endpoint: '/api/cache/clear', payload: { action: 'clear' } })} />
        </TabsContent>
      </Tabs>

      {/* new user */}
      <FormModal open={userOpen} onOpenChange={setUserOpen} icon={UserPlus} title="Create user" subtitle="A temporary password is issued and forced change at first login." schema={{ sections: userSections }}
        onSubmit={async (v) => {
          const data = await genericMut.mutateAsync({ endpoint: '/api/users', payload: { name: v.name, email: v.email, phone: v.phone || undefined, role: v.role, designation: v.designation || null } });
          toast({ title: 'User created', description: `Temp password: ${(data as any).tempPassword}` });
          setUserOpen(false);
        }}
        submitLabel="Create user" />

      <ConfirmDialog open={Boolean(resetFor)} onOpenChange={() => setResetFor(null)} title={`Reset password — ${resetFor?.email ?? ''}`} description="A temporary password is issued; the user must change it at next login." confirmLabel="Reset"
        onConfirm={async () => { const d = await genericMut.mutateAsync({ endpoint: `/api/users/${resetFor.id}/reset-password`, payload: {} }); toast({ title: 'Password reset', description: `Temp password: ${(d as any).tempPassword}` }); }} />

      <ConfirmDialog open={Boolean(impersonateFor)} onOpenChange={() => setImpersonateFor(null)} title={`Cross-login as ${impersonateFor?.name ?? ''}`} description="Super admin view-only mode with a persistent banner. Financial mutations are blocked while impersonating." confirmLabel="Start"
        onConfirm={async () => {
          const d = await genericMut.mutateAsync({ endpoint: '/api/admin/impersonate', payload: { userId: impersonateFor.id, reason: impersonateReason || 'Support review' } });
          toast({ title: 'Now viewing as ' + (d as any).actAs?.name, description: 'Use the red banner Exit button to return.' });
        }}>
        <input value={impersonateReason} onChange={(e) => setImpersonateReason(e.target.value)} placeholder="Reason (mandatory, audited)" className="dsms-input h-10 w-full" aria-label="Reason" />
      </ConfirmDialog>
    </>
  );
}

// ================================================================ sub-panels
function RbacMatrix({ data, canManage, onSave }: any) {
  const [matrix, setMatrix] = React.useState<Record<string, string[]>>({});
  React.useEffect(() => { if (data?.matrix) setMatrix(data.matrix); }, [data]);
  if (!data) return <p className="text-sm">Loading…</p>;
  const perms: string[] = data.permissions;
  return (
    <div className="public-card section-pad">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Permission matrix</h3>
          <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Active sessions keep their snapshot until refresh — ask staff to re-login after saving.</p>
        </div>
        {canManage && <Button2 onClick={() => onSave(matrix)} icon={Save} label="Save matrix" primary />}
      </div>
      <div className="overflow-x-auto">
        <table className="dsms-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220, textAlign: 'left' }}>Permission</th>
              {(data.designations ?? []).map((d: string) => <th key={d} style={{ textAlign: 'center' }}>{d.replace(/_/g, ' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p}>
                <td className="font-mono text-[11px]">{p}</td>
                {(data.designations ?? []).map((d) => (
                  <td key={d} style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      style={{ accentColor: 'var(--t-primary)' }}
                      checked={(matrix[d] ?? []).includes(p)}
                      onChange={(e) => setMatrix((prev) => {
                        const list = new Set(prev[d] ?? []);
                        if (e.target.checked) list.add(p); else list.delete(p);
                        return { ...prev, [d]: [...list] };
                      })}
                      disabled={!canManage}
                      aria-label={`${p} for ${d}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTable({ data }: any) {
  const columns: ColumnSpec<any>[] = [
    { key: 'createdAt', header: 'When', type: 'datetime', defaultVisible: true, filter: 'dateRange' },
    { key: 'action', header: 'Action', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'module', header: 'Module', type: 'text', defaultVisible: true, filter: 'select' },
    { key: 'severity', header: 'Severity', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'userId', header: 'Actor', type: 'text' },
    { key: 'entity', header: 'Entity', type: 'text' },
    { key: 'entityId', header: 'Record', type: 'text' },
    { key: 'ip', header: 'IP', type: 'text' },
    { key: 'before', header: 'Before', type: 'text', hideOnExport: true },
    { key: 'after', header: 'After', type: 'text', hideOnExport: true },
  ];
  return <DataTable id="audit" title="Audit trail" subtitle="Append-only — every mutation with before/after JSON" data={data} columns={columns} searchKeys={['action', 'module', 'entityId']} exportPermission="audit_export" />;
}

function HrPayroll({ hr, payroll, canApprove, onGenerate, onApprove, onPay }: any) {
  const staffCols: ColumnSpec<any>[] = [
    { key: 'staffNo', header: 'Staff No', type: 'text', defaultVisible: true },
    { key: 'name', header: 'Name', type: 'text', defaultVisible: true },
    { key: 'designation', header: 'Designation', type: 'text', defaultVisible: true, filter: 'select' },
    { key: 'department', header: 'Department', type: 'text' },
    { key: 'employmentDate', header: 'Employed since', type: 'date', defaultVisible: true },
    { key: 'grossSalaryCents', header: 'Gross salary', type: 'money', defaultVisible: true, filter: 'range' },
    { key: 'basicSalaryCents', header: 'Basic', type: 'money' },
    { key: 'status', header: 'Status', type: 'badge' },
  ];
  const leaveCols: ColumnSpec<any>[] = [
    { key: 'staff', header: 'Staff', type: 'text', defaultVisible: true },
    { key: 'type', header: 'Type', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'fromDate', header: 'From', type: 'date', defaultVisible: true },
    { key: 'toDate', header: 'To', type: 'date', defaultVisible: true },
    { key: 'days', header: 'Days', type: 'number', defaultVisible: true },
    { key: 'reason', header: 'Reason', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
  ];
  const payrollCols: ColumnSpec<any>[] = [
    { key: 'period', header: 'Period', type: 'text', defaultVisible: true },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'totalGrossCents', header: 'Gross', type: 'money', defaultVisible: true },
    { key: 'totalDeductionsCents', header: 'Deductions', type: 'money', defaultVisible: true },
    { key: 'totalNetCents', header: 'Net', type: 'money', defaultVisible: true },
    { key: 'payDate', header: 'Paid', type: 'date' },
  ];
  const activeRun = (payroll ?? [])[0];
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-bold">Staff</h3>
        <DataTable id="hr-staff" title="Staff register" subtitle="Bio-data + salary structure" data={hr?.staff ?? []} columns={staffCols} searchKeys={['name', 'staffNo']} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">Leave requests</h3>
        <DataTable id="hr-leaves" title="Leave" subtitle="Pending → approved/rejected by manager" data={hr?.leaves ?? []} columns={leaveCols} searchKeys={['staff']} />
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Payroll</h3>
          {activeRun && activeRun.status === 'DRAFT' && <Button2 onClick={() => onGenerate(activeRun.id)} label="Generate entries" primary />}
          {activeRun && activeRun.status === 'DRAFT' && canApprove && <Button2 onClick={() => onApprove(activeRun.id)} label="Approve run" />}
          {activeRun && activeRun.status === 'APPROVED' && <Button2 onClick={() => onPay(activeRun.id)} label="Pay (GL + payslips)" primary />}
        </div>
        <DataTable id="payroll" title="Payroll runs" subtitle="Statutory tables editable in settings; snapshots stored per run" data={payroll ?? []} columns={payrollCols} searchKeys={['period']} />
        {activeRun?.entries?.length ? (
          <div className="mt-3 dsms-table-wrap">
            <table className="dsms-table">
              <thead><tr><th>#</th><th>Staff</th><th>Basic</th><th>Gross</th><th>PAYE</th><th>NSSF</th><th>SHIF</th><th>Housing</th><th>Sacco loan</th><th>Net</th></tr></thead>
              <tbody>
                {activeRun.entries.map((e: any, i: number) => (
                  <tr key={e.id}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{e.staff}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.basicCents)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.grossCents)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.deductions?.PAYE ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.deductions?.NSSF ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.deductions?.SHIF ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.deductions?.HousingLevy ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoneyPlain(e.deductions?.SaccoLoan ?? 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoneyPlain(e.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EntityForm({ data, onSave, canEdit }: any) {
  const [form, setForm] = React.useState<any>({});
  React.useEffect(() => { if (data) setForm(data); }, [data]);
  if (!data) return <p className="text-sm">Loading…</p>;
  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));
  const fields: [string, string][] = [
    ['name', 'Entity name'], ['tagline', 'Tagline (emails, hero, footer)'], ['slogan', 'Slogan'],
    ['registrationNo', 'Registration No'], ['phone', 'Phone'], ['altPhone', 'Alt phone'], ['email', 'Email'],
    ['website', 'Website'], ['physicalAddress', 'Physical address'], ['town', 'Town'], ['county', 'County'],
    ['country', 'Country'], ['postalCode', 'Postal code'], ['currency', 'Currency'], ['timezone', 'Timezone'],
  ];
  return (
    <div className="public-card section-pad">
      <h3 className="mb-1 text-sm font-bold">Entity configuration</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Single source for the public site header/footer, letterheads, emails, SMS footers and the PWA manifest.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className="mb-1 block text-xs font-semibold">{label}</label>
            <input value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} disabled={!canEdit} className="dsms-input h-10" aria-label={label} />
          </div>
        ))}
      </div>
      {canEdit && (
        <Button2 onClick={() => onSave(form)} icon={Save} label="Save entity details" primary />
      )}
    </div>
  );
}

function WebsiteSettings({ onSave, canEdit }: any) {
  const [layout, setLayout] = React.useState<'boxed' | 'full'>('boxed');
  return (
    <div className="public-card section-pad">
      <h3 className="mb-1 text-sm font-bold">Public website layout</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Switching layout re-flows the entire public website (every page).</p>
      <div className="flex gap-3">
        {(['boxed', 'full'] as const).map((l) => (
          <button key={l} disabled={!canEdit} onClick={() => setLayout(l)} className={`rounded-xl border p-4 text-left ${layout === l ? 'border-[var(--t-primary)]' : ''}`} style={{ borderColor: layout === l ? 'var(--t-primary)' : 'var(--t-border)', background: layout === l ? 'color-mix(in srgb, var(--t-primary) 6%, transparent)' : 'transparent' }}>
            <p className="text-sm font-bold">{l === 'boxed' ? 'Boxed layout' : 'Full-width layout'}</p>
            <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{l === 'boxed' ? 'Centered max-w-7xl container with margins' : 'Edge-to-edge sections, immersive hero'}</p>
            <div className={`mt-3 h-10 w-40 rounded-md border ${l === 'boxed' ? 'mx-auto w-24' : ''}`} style={{ background: 'var(--t-table-header-a)', borderColor: 'var(--t-border)' }} />
          </button>
        ))}
      </div>
      {canEdit && <div className="mt-4"><Button2 onClick={() => onSave({ layout })} icon={Save} label="Apply layout" primary /></div>}
    </div>
  );
}

function FeatureToggles({ onSave, canEdit }: any) {
  const [toggles, setToggles] = React.useState<Record<string, boolean>>({
    memberSelfService: true, publicRegistration: true, publicApplications: true, showStatsOnWebsite: true, dividendsEnabled: true, twoFactorOptional: true,
  });
  const help: Record<string, string> = {
    memberSelfService: 'OFF = members cannot log in; only admins/managers transact on their behalf (full-management mode).',
    publicRegistration: 'Show “Become a member” CTAs on the website.',
    publicApplications: 'Accept the /apply form (when off, visitors see a notice).',
    showStatsOnWebsite: 'Live member/savings stats band on the landing page.',
    dividendsEnabled: 'Enable the dividend run workflow.',
    twoFactorOptional: 'Allow OTP confirmation for guarantor responses.',
  };
  return (
    <div className="public-card section-pad">
      <h3 className="mb-1 text-sm font-bold">Feature flags & limits</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Changes take effect immediately platform-wide and are audited.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.keys(toggles).map((k) => (
          <label key={k} className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-4" style={{ borderColor: 'var(--t-border)' }} aria-disabled={!canEdit}>
            <span>
              <strong className="text-sm">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</strong>
              <span className="block text-xs" style={{ color: 'var(--t-muted-text)' }}>{help[k]}</span>
            </span>
            <input type="checkbox" className="mt-1 h-5 w-5" style={{ accentColor: 'var(--t-primary)' }} checked={toggles[k]} disabled={!canEdit} onChange={(e) => setToggles((p) => ({ ...p, [k]: e.target.checked }))} />
          </label>
        ))}
      </div>
      {canEdit && <div className="mt-4"><Button2 onClick={() => onSave(toggles)} icon={Save} label="Save features" primary /></div>}
    </div>
  );
}

function ThemeGallery({ data, canManage, onApply }: any) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Theme gallery — {data.length} presets</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Applying a theme restyles the ENTIRE platform + public website instantly (colors, fonts, sidebar, header, footer, tables, scrollbars, dividers).</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(data ?? []).map((t: any) => (
          <div key={t.id} className="overflow-hidden rounded-xl border" style={{ borderColor: t.active ? 'var(--t-primary)' : 'var(--t-border)', borderWidth: t.active ? 2 : 1 }}>
            <div className="flex" style={{ height: 84 }}>
              <div style={{ width: 64, background: t.tokens?.colors?.sidebar ?? '#123' }} />
              <div className="flex-1 p-2" style={{ background: t.tokens?.colors?.bg ?? '#fff' }}>
                <div className="mb-1 rounded-md" style={{ height: 12, width: '60%', background: t.tokens?.colors?.primary ?? '#085', borderRadius: 4 }} />
                <div className="mb-1 rounded-md" style={{ height: 8, width: '90%', background: t.tokens?.colors?.tableHeaderA ?? '#eee', borderRadius: 4 }} />
                <div className="rounded-md" style={{ height: 8, width: '75%', background: t.tokens?.colors?.tableHeaderB ?? '#e5e', borderRadius: 4 }} />
                <div className="mt-2 flex gap-1">
                  {[t.tokens?.colors?.primary, t.tokens?.colors?.accent, t.tokens?.colors?.info, t.tokens?.colors?.success].map((c, i) => (
                    <span key={i} className="inline-block h-4 w-4 rounded-full" style={{ background: c ?? '#ccc' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-bold">{t.name}</p>
              <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{t.description}</p>
              <p className="mt-1 text-[10px]" style={{ color: 'var(--t-muted-text)' }}>{t.tokens?.fonts?.heading} / {t.tokens?.fonts?.body}</p>
              <div className="mt-2 flex items-center gap-2">
                {t.active
                  ? <Badge className={badgeClass.success}>Active</Badge>
                  : canManage && <Button2 onClick={() => onApply(t.id)} label="Apply" primary />}
                {t.isDarkReady && <Badge variant="outline"><Sun className="mr-1 h-3 w-3" /> dark ready</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LetterheadGallery({ data, canManage, onApply }: any) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Letterhead designs — {data.length} templates</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>The active design is used by EVERY exported/printed document with live entity details.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((l: any) => (
          <div key={l.id} className="overflow-hidden rounded-xl border" style={{ borderColor: l.active ? 'var(--t-primary)' : 'var(--t-border)', borderWidth: l.active ? 2 : 1 }}>
            <div className="p-4" style={{ background: 'var(--t-surface)', minHeight: 108 }}>
              {l.design?.headerLayout === 'centered' && (
                <div className="text-center">
                  <p className="text-sm font-black tracking-wider" style={{ color: 'var(--t-primary)' }}>DIVINE SACCO SOCIETY LTD</p>
                  <p className="text-[10px]" style={{ color: 'var(--t-muted-text)' }}>Growing Together, Prospering Together</p>
                  <p className="mt-2 text-[9px]" style={{ color: 'var(--t-muted-text)' }}>Divine Plaza, Kenyatta Avenue, Nairobi · +254 700 123 456 · info@divinesacco.co.ke</p>
                  <div className="mx-auto mt-2 h-[3px] w-3/4" style={{ background: 'var(--t-primary)' }} />
                </div>
              )}
              {l.design?.headerLayout === 'split' && (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-black" style={{ color: 'var(--t-primary)' }}>DIVINE SACCO</p>
                    <p className="text-[10px]" style={{ color: 'var(--t-muted-text)' }}>tagline</p>
                  </div>
                  <div className="text-right text-[9px]" style={{ color: 'var(--t-muted-text)' }}>Reg SASR/P/0012/2015<br />Doc: —<br />Issued: today</div>
                </div>
              )}
              {['band', 'gradient', 'sidebar', 'boxed', 'watermark', 'ribbon', 'minimal', 'duotone'].includes(l.design?.headerLayout) && (
                <div>
                  {['band', 'gradient'].includes(l.design?.headerLayout) ? (
                    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--t-primary)' }}>
                      <p className="text-sm font-bold text-white">DIVINE SACCO SOCIETY LTD</p>
                      <p className="text-[10px] text-white/85">Growing Together, Prospering Together</p>
                    </div>
                  ) : l.design?.headerLayout === 'sidebar' ? (
                    <div className="flex gap-3">
                      <div style={{ width: 8, background: 'var(--t-primary)', borderRadius: 3 }} />
                      <div>
                        <p className="text-sm font-black" style={{ color: 'var(--t-primary)' }}>DIVINE SACCO SOCIETY LTD</p>
                        <p className="text-[10px]" style={{ color: 'var(--t-muted-text)' }}>contacts · website</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-black" style={{ color: 'var(--t-primary)' }}>DIVINE SACCO SOCIETY LTD</p>
                      <p className="text-[10px]" style={{ color: 'var(--t-muted-text)' }}>contacts line · {l.design?.headerLayout} style</p>
                      <div className="mx-auto mt-2 h-px w-2/3" style={{ background: 'var(--t-border)' }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-3">
              <p className="text-sm font-bold">{l.name}</p>
              {l.active ? <Badge className={badgeClass.success}>Active</Badge> : canManage && <Button2 onClick={() => onApply(l.id)} label="Set active" primary />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationsPanel({ data, canManage, onSave, onTest }: any) {
  const [draft, setDraft] = React.useState<Record<string, Record<string, string>>>({});
  const setVal = (provider: string, key: string, v: string) => setDraft((p) => ({ ...p, [provider]: { ...(p[provider] ?? {}), [key]: v } }));
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">Integration credentials</h3>
      <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Saved values are AES-256-GCM encrypted at rest, shown masked, never returned to the browser. Entering credentials auto-tests and activates the integration.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((p: any) => (
          <div key={p.provider} className="public-card section-pad">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{p.provider.replace(/_/g, ' ')}</p>
                <Badge className={badgeClass[statusBadge(p.status).tone]}>{statusBadge(p.status).label}</Badge>
                {p.lastError && <p className="mt-1 text-xs" style={{ color: 'var(--t-danger)' }}>{p.lastError}</p>}
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button2 onClick={() => onTest(p.provider)} label="Test" />
                  <Button2 onClick={() => onSave(p.provider, draft[p.provider] ?? {}, { environment: p.environment, demoMode: p.demoMode })} label="Save & activate" primary />
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {p.fields.map((f: any) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-semibold">{f.label} {f.set && <span style={{ color: 'var(--t-success)' }}>· {f.masked}</span>}</label>
                  <input
                    value={draft[p.provider]?.[f.key] ?? ''}
                    onChange={(e) => setVal(p.provider, f.key, e.target.value)}
                    disabled={!canManage}
                    type={/secret|pass|key/i.test(f.key) ? 'password' : 'text'}
                    placeholder={f.set ? 'leave blank to keep current' : 'enter value…'}
                    className="dsms-input h-9 text-xs"
                  />
                </div>
              ))}
            </div>
            {p.provider !== 'SOCIAL' && (
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input type="checkbox" defaultChecked={p.demoMode} disabled={!canManage} style={{ accentColor: 'var(--t-primary)' }} />
                Demo mode — simulate provider responses for training (badged SIMULATED)
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileManager({ data, onDelete, canDelete }: any) {
  const [module, setModule] = React.useState('');
  const files: any[] = (data?.files ?? []).filter((f: any) => !module || f.moduleName === module);
  const tree: Record<string, Record<string, number>> = data?.tree ?? {};
  const cols: ColumnSpec<any>[] = [
    { key: 'originalName', header: 'File', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'moduleName', header: 'Module', type: 'text', defaultVisible: true, filter: 'select' },
    { key: 'mime', header: 'Type', type: 'text', defaultVisible: true },
    { key: 'size', header: 'Size (KB)', type: 'number', defaultVisible: true },
    { key: 'source', header: 'Source', type: 'badge', defaultVisible: true },
    { key: 'compressed', header: 'Compressed', type: 'bool' },
    { key: 'createdAt', header: 'Uploaded', type: 'date', defaultVisible: true, filter: 'dateRange' },
  ];
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">File manager portal</h3>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModule('')} className={`act-btn ${!module ? 'act-primary' : 'act-extra opacity-60'}`}>All ({(data?.files ?? []).length})</button>
        {Object.entries(tree).map(([m, months]) => (
          <button key={m} onClick={() => setModule(m)} className={`act-btn ${module === m ? 'act-primary' : 'act-extra opacity-70'}`}>
            {m} ({Object.values(months).reduce((s, n) => s + n, 0)})
          </button>
        ))}
      </div>
      {module && (
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--t-muted-text)' }}>
          {Object.entries(tree[module] ?? {}).sort().reverse().map(([month, n]) => (
            <Badge key={month} variant="outline">{month}: {n} file(s)</Badge>
          ))}
        </div>
      )}
      <DataTable
        id="file-manager"
        title="All uploads"
        subtitle="Grouped by module and date"
        data={files}
        columns={cols}
        searchKeys={['originalName', 'moduleName']}
        actions={[
          { label: 'Open', icon: Upload, color: 'view', onClick: (r: any) => window.open(r.url, '_blank') },
          ...(canDelete ? [{ label: 'Delete', icon: Trash2, color: 'delete', onClick: (r: any) => onDelete(r.id) }] : []),
        ]}
      />
    </div>
  );
}

function CachePanel({ data, canManage, onToggle, onClear }: any) {
  return (
    <div className="public-card section-pad">
      <h3 className="mb-1 text-sm font-bold">Cache management</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>Toggle page caching (ISR) for speed, or clear to force fresh data everywhere.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Badge className={data?.enabled ? badgeClass.success : badgeClass.neutral}>{data?.enabled ? 'Caching ON' : 'Caching OFF'} · revalidate {data?.revalidateSeconds ?? 60}s</Badge>
        {canManage && <Button2 onClick={() => onToggle(!data?.enabled)} icon={Gauge} label={data?.enabled ? 'Disable cache' : 'Enable cache'} />}
        {canManage && <Button2 onClick={onClear} label="Clear cache now" primary />}
      </div>
    </div>
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
