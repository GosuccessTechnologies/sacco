'use client';
// Communications center — compose, templates, groups, logs (guide §16.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Users, Pencil, FileSpreadsheet, Upload } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { FormModal, type SectionDef } from '@/components/kit/FormModal';
import { RichTextEditor } from '@/components/kit/RichTextEditor';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtDateTime, badgeClass, statusBadge } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CommsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = React.useState('compose');
  const [channel, setChannel] = React.useState<'EMAIL' | 'SMS' | 'BOTH'>('EMAIL');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('<p>Dear member,</p><p>…</p><p>Warm regards,<br><strong>Divine Sacco Society Ltd</strong></p>');
  const [groupId, setGroupId] = React.useState('');
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [csvContacts, setCsvContacts] = React.useState('');
  const [editTpl, setEditTpl] = React.useState<any | null>(null);
  const [tplBody, setTplBody] = React.useState('');

  const groups = useQuery({ queryKey: ['comms-groups'], queryFn: async () => (await fetch('/api/comms/groups')).json() });
  const templates = useQuery({ queryKey: ['comms-templates'], queryFn: async () => (await fetch('/api/comms/templates')).json() });
  const logs = useQuery({ queryKey: ['comms-logs'], queryFn: async () => (await fetch('/api/comms/logs')).json() });

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/comms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, subject, bodyHtml: body, groupId, marketing: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['comms-logs'] });
      toast({ title: `Broadcast complete — ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ''}` });
    },
    onError: (e: Error) => toast({ title: 'Send failed', description: e.message, variant: 'destructive' }),
  });

  const groupMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/comms/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comms-groups'] }); toast({ title: 'Group created' }); setGroupOpen(false); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const tplMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/comms/templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comms-templates'] }); toast({ title: 'Template updated' }); setEditTpl(null); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const templateColumns: ColumnSpec<any>[] = [
    { key: 'code', header: 'Code', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'channel', header: 'Channel', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'subject', header: 'Subject', type: 'text', defaultVisible: true },
    { key: 'excerpt', header: 'Body', type: 'text', defaultVisible: true },
    { key: 'category', header: 'Category', type: 'badge' },
    { key: 'active', header: 'Active', type: 'bool' },
  ];

  const logColumns: ColumnSpec<any>[] = [
    { key: 'createdAt', header: 'Sent', type: 'datetime', defaultVisible: true, filter: 'dateRange' },
    { key: 'channel', header: 'Channel', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'subject', header: 'Subject', type: 'text', defaultVisible: true },
    { key: 'recipientsCount', header: 'Recipients', type: 'number', defaultVisible: true },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
  ];

  const groupSections: SectionDef[] = [
    {
      title: 'Contact group', icon: Users,
      fields: [
        { name: 'name', label: 'Group name', required: true },
        { name: 'source', label: 'Audience source', type: 'select', required: true, options: [
          { value: 'SUBSCRIBERS', label: 'Website subscribers' },
          { value: 'ACTIVE_MEMBERS', label: 'All active members' },
          { value: 'LOAN_DUE', label: 'Loans due within 7 days' },
          { value: 'MEMBERS_WITH_SAVINGS', label: 'Members with savings' },
          { value: 'SHAREHOLDERS', label: 'Shareholders' },
          { value: 'CUSTOM_CSV', label: 'Custom CSV import' },
        ] },
        { name: 'description', label: 'Description', type: 'textarea' },
      ],
    },
  ];

  return (
    <>
      <PageHeader icon={MessageSquare} title="Communications" description="Branded email + SMS broadcasts, templates with placeholders, delivery logs with per-recipient drilldown." actions={can('comms_groups') ? <Button2 onClick={() => setGroupOpen(true)} icon={Users} label="New group" /> : undefined} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-3">
          <TabsTrigger value="compose">Compose & send</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="logs">Delivery logs</TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="public-card section-pad lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold">Broadcast composer</h3>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['EMAIL', 'SMS', 'BOTH'] as const).map((c) => (
                    <button key={c} onClick={() => setChannel(c)} className={`act-btn ${channel === c ? 'act-primary' : 'act-extra opacity-60'}`}>{c === 'BOTH' ? 'Email + SMS' : c === 'EMAIL' ? 'Email only' : 'SMS only'}</button>
                  ))}
                </div>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="dsms-input h-10" aria-label="Audience">
                  <option value="">Select audience group…</option>
                  {(groups.data ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.audience})</option>)}
                </select>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={channel === 'SMS' ? 'SMS text works as the subject line' : 'Subject (email)'} className="dsms-input h-10" />
                {channel !== 'SMS' && <RichTextEditor value={body} onChange={setBody} minHeight={200} />}
                {channel === 'SMS' && (
                  <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--t-border)' }}>
                    <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={4} className="dsms-textarea w-full" placeholder="Type the SMS message (160 chars per segment)…" />
                    <p className="mt-1 text-xs" style={{ color: 'var(--t-muted-text)' }}>Length: {subject.length} chars → {Math.max(1, Math.ceil(subject.length / 160))} segment(s). Footer “— Divine Sacco…” appended automatically.</p>
                  </div>
                )}
                <Button size="sm" className="bg-[var(--t-primary)] text-white" disabled={!groupId || (!subject && channel !== 'EMAIL') || (channel === 'EMAIL' && !body)} onClick={() => sendMut.mutate()} >
                  <Send className="mr-1 h-3.5 w-3.5" /> {sendMut.isPending ? 'Sending…' : 'Send broadcast'}
                </Button>
              </div>
            </div>
            <div className="public-card section-pad">
              <h3 className="mb-2 text-sm font-bold">Live branded preview</h3>
              <div className="overflow-hidden rounded-xl">
                <div className="card-hero px-4 py-3">
                  <p className="text-sm font-bold">Divine Sacco Society Ltd</p>
                  <p className="text-[11px] opacity-90">Growing Together, Prospering Together</p>
                </div>
                <div className="px-4 py-3 text-xs">
                  <p className="mb-2 font-bold">{subject || 'Your subject line'}</p>
                  <div className="leading-relaxed" style={{ color: 'var(--t-muted-text)' }}
                    dangerouslySetInnerHTML={{ __html: channel === 'SMS' ? subject.replace(/\n/g, '<br/>') : body }} />
                </div>
                <div className="px-4 py-3 text-[10px]" style={{ background: 'var(--t-table-header-a)', color: 'var(--t-muted-text)' }}>
                  +254 700 123 456 · info@divinesacco.co.ke · Reply STOP to opt out
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <DataTable
            id="comms-templates"
            title="Message templates"
            subtitle="Placeholders like {{name}} render per recipient — used by all automated triggers"
            data={templates.data ?? []}
            columns={templateColumns}
            searchKeys={['code', 'subject']}
            actions={[{ label: 'Edit', icon: Pencil, color: 'edit', show: () => can('comms_templates'), onClick: (r: any) => { setEditTpl(r); setTplBody(r.channel === 'SMS' ? r.body : r.body); } }]}
          />
        </TabsContent>

        <TabsContent value="groups">
          <GroupTable data={groups.data ?? []} />
        </TabsContent>

        <TabsContent value="logs">
          <DataTable
            id="comms-logs"
            title="Delivery logs"
            subtitle="Per-recipient statuses with errors — proof-of-content snapshots stored"
            data={logs.data ?? []}
            columns={logColumns}
            searchKeys={['subject']}
            emptyMessage="No broadcasts yet."
          />
        </TabsContent>
      </Tabs>

      {groupOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setGroupOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl">
            <FormModal open={groupOpen} onOpenChange={setGroupOpen} icon={Users} title="New contact group (CSV tab below)" subtitle="Dynamic sources resolve at send time; CSV imports materialize once." schema={{ sections: groupSections }}
              onSubmit={async (v) => {
                const contacts = v.source === 'CUSTOM_CSV'
                  ? csvText.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
                      const [name, email, phone] = line.split(',');
                      return { name: name?.trim(), email: email?.trim() || undefined, phone: phone?.trim() || undefined };
                    })
                  : undefined;
                await groupMut.mutate({ name: v.name, source: v.source, description: v.description || undefined, csvContacts: contacts });
              }}
              submitLabel="Create group">
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--t-border)' }}>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold"><Upload className="h-3.5 w-3.5" /> Custom CSV contacts (for CUSTOM_CSV source)</p>
                <p className="mb-2 text-[11px]" style={{ color: 'var(--t-muted-text)' }}>Header: <code>name,email,phone</code> — one contact per row.</p>
                <textarea value={csvContacts} onChange={(e) => setCsvContacts(e.target.value)} rows={6} placeholder={'name,email,phone\nJane,jane@example.com,+254700000111'} className="dsms-textarea w-full font-mono text-xs" />
              </div>
            </FormModal>
          </div>
        </div>
      )}

      {editTpl && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEditTpl(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl">
            <FormModal open={Boolean(editTpl)} onOpenChange={() => setEditTpl(null)} icon={Pencil} title={`Edit template — ${editTpl.code} (${editTpl.channel})`}
              subtitle="Placeholders: {{name}} {{amount}} {{memberNumber}} {{entity}} etc. Rendered snapshots are stored on every send."
              schema={{ sections: [{ title: 'Template', fields: [{ name: 'subject', label: 'Subject', defaultValue: editTpl.subject ?? '' }] }] }}
              initial={{ subject: editTpl.subject ?? '' }}
              onSubmit={async (v) => { await tplMut.mutate({ id: editTpl.id, subject: v.subject || undefined, body: tplBody }); }}
              submitLabel="Save template">
              {editTpl.channel === 'SMS'
                ? <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={5} className="dsms-textarea w-full" aria-label="SMS body" />
                : <RichTextEditor value={tplBody} onChange={setTplBody} minHeight={180} />}
            </FormModal>
          </div>
        </div>
      )}
    </>
  );
}

function GroupTable({ data }: any) {
  const columns: ColumnSpec<any>[] = [
    { key: 'name', header: 'Group', type: 'text', defaultVisible: true },
    { key: 'source', header: 'Source', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'description', header: 'Description', type: 'text', defaultVisible: true },
    { key: 'audience', header: 'Recipients (now)', type: 'number', defaultVisible: true },
  ];
  return <DataTable id="comms-groups" title="Contact groups" subtitle="Audiences resolved live from modules + imports" data={data} columns={columns} searchKeys={['name']} />;
}

function Button2({ onClick, icon: Icon, label }: { onClick: () => void; icon?: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
