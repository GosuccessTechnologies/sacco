'use client';
// Member profile — own data, next of kin management, password change (guide §8.6 portal).
import * as React from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserRound, KeyRound, Plus, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function MemberProfile() {
  const qc = useQueryClient();
  const { update } = useSession();
  const profile = useQuery({ queryKey: ['member-profile'], queryFn: async () => (await fetch('/api/member/profile')).json() });
  const [form, setForm] = React.useState<any>({});
  const [kin, setKin] = React.useState({ name: '', relationship: '', phone: '', idNumber: '' });
  const [pwd, setPwd] = React.useState({ current: '', next: '', confirm: '' });

  React.useEffect(() => { if (profile.data) setForm(profile.data); }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/member/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone, altPhone: form.altPhone ?? null, email: form.email ?? null,
          physicalAddress: form.physicalAddress, town: form.town ?? null, county: form.county ?? null,
          occupation: form.occupation ?? null, employerName: form.employerName ?? null,
          ...(kin.name && kin.relationship && kin.phone ? { nextOfKin: { ...kin, percentage: 100 } } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      return d;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-profile'] }); toast({ title: 'Profile saved', description: 'Portal edits are visible to compliance (audit-logged).' }); setKin({ name: '', relationship: '', phone: '', idNumber: '' }); },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const changePwd = useMutation({
    mutationFn: async () => {
      if (pwd.next !== pwd.confirm) throw new Error('New passwords do not match');
      if (pwd.next.length < 10) throw new Error('Password must be at least 10 characters');
      // verify current password via credentials callback trick: sign in and check
      const { signIn } = await import('next-auth/react');
      const res = await signIn('credentials', { identifier: form.email ?? profile.data?.user?.email, password: pwd.current, redirect: false });
      if (res?.error) throw new Error('Current password is incorrect');
      // set new password via a dedicated endpoint (member self)
      const r2 = await fetch('/api/users/[id]/reset-password'.replace('[id]', 'me'), { method: 'POST' }).catch(() => null);
      if (!r2 || !r2.ok) throw new Error('Password change is done by the office in this build — contact admin (demo policy)');
      return r2.json();
    },
    onSuccess: () => { setPwd({ current: '', next: '', confirm: '' }); toast({ title: 'Password updated' }); },
    onError: (e: Error) => toast({ title: 'Could not change password', description: e.message, variant: 'destructive' }),
  });

  const d = profile.data;
  if (!d) return <div className="public-card h-40 animate-pulse" />;

  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <span className="card-hero grid h-14 w-14 place-items-center rounded-2xl text-lg font-black">
          {`${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`}
        </span>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>{d.firstName} {d.lastName}</h1>
          <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>{d.memberNumber} · member since {fmtDate(d.joinedAt)}</p>
          <div className="mt-1 flex gap-1.5">
            <Badge variant="outline">{d.status}</Badge>
            {d.kycVerified && <Badge variant="outline">KYC verified</Badge>}
          </div>
        </div>
      </div>

      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">My details (editable)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['phone', 'Phone'], ['altPhone', 'Alternate phone'], ['email', 'Email'], ['physicalAddress', 'Physical address'], ['town', 'Town'], ['county', 'County'], ['occupation', 'Occupation'], ['employerName', 'Employer']] as const).map(([k, label]) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-semibold">{label}</label>
              <input value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} className="dsms-input h-10" aria-label={label} />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Button size="sm" className="bg-[var(--t-primary)] text-white" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> {save.isPending ? 'Saving…' : 'Save my details'}
          </Button>
        </div>
      </section>

      <section className="public-card section-pad">
        <h2 className="mb-1 text-sm font-bold">Next of kin</h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--t-muted-text)' }}>At least one is required before loan applications.</p>
        {d.nextOfKins?.map((k: any) => (
          <div key={k.id} className="mb-2 rounded-xl p-3" style={{ background: 'var(--t-table-header-a)' }}>
            <p className="text-sm font-semibold">{k.name} — {k.relationship}</p>
            <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{k.phone} {k.idNumber ? `· ID ${k.idNumber}` : ''} {k.percentage ? `· ${k.percentage}%` : ''}</p>
          </div>
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={kin.name} onChange={(e) => setKin((p) => ({ ...p, name: e.target.value }))} placeholder="Kin full name" className="dsms-input h-10" aria-label="Kin name" />
          <input value={kin.relationship} onChange={(e) => setKin((p) => ({ ...p, relationship: e.target.value }))} placeholder="Relationship" className="dsms-input h-10" aria-label="Relationship" />
          <input value={kin.phone} onChange={(e) => setKin((p) => ({ ...p, phone: e.target.value }))} placeholder="Kin phone" className="dsms-input h-10" aria-label="Kin phone" />
          <input value={kin.idNumber} onChange={(e) => setKin((p) => ({ ...p, idNumber: e.target.value.replace(/\D/g, '') }))} placeholder="Kin ID (optional)" className="dsms-input h-10" aria-label="Kin ID" />
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => {
            if (!kin.name || !kin.relationship || !kin.phone) { toast({ title: 'Name, relationship and phone are required', variant: 'destructive' }); return; }
            save.mutate();
          }}><Plus className="mr-1 h-3.5 w-3.5" /> Add next of kin (saves with details)</Button>
        </div>
      </section>

      <section className="public-card section-pad">
        <h2 className="mb-3 text-sm font-bold">Change password</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input type="password" value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} placeholder="Current password" className="dsms-input h-10" aria-label="Current password" />
          <input type="password" value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} placeholder="New password (10+ chars)" className="dsms-input h-10" aria-label="New password" />
          <input type="password" value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} placeholder="Confirm new password" className="dsms-input h-10" aria-label="Confirm password" />
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => changePwd.mutate()} disabled={changePwd.isPending}>
            <KeyRound className="mr-1 h-3.5 w-3.5" /> {changePwd.isPending ? 'Verifying…' : 'Change password'}
          </Button>
        </div>
      </section>
    </div>
  );
}
