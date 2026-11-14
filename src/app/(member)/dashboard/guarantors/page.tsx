'use client';
// Guarantor inbox — accept/decline with live eligibility (guide §10.2.3).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fmtMoneyPlain, fmtDate, badgeClass, statusBadge } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function GuarantorsPage() {
  const qc = useQueryClient();
  const requests = useQuery({ queryKey: ['guarantors'], queryFn: async () => (await fetch('/api/member/guarantors')).json() });

  const respond = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'accept' | 'decline' }) => {
      const res = await fetch('/api/member/guarantors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guarantorId: id, decision }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      return d;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['guarantors'] });
      toast({ title: d.status === 'ACCEPTED' ? 'You accepted — thank you!' : 'You declined — the applicant is notified.' });
    },
    onError: (e: Error) => toast({ title: 'Could not respond', description: e.message, variant: 'destructive' }),
  });

  const rows: any[] = requests.data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--t-heading-font)' }}>Guarantor inbox</h1>
      {pending.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-warning)', background: 'color-mix(in srgb, var(--t-warning) 8%, transparent)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--t-warning)' }}>{pending.length} request(s) awaiting your response</p>
          <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Accepted guarantees place a temporary hold on your savings until the loan is settled.</p>
        </div>
      )}
      {rows.length ? rows.map((g) => (
        <div key={g.id} className="public-card section-pad">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{g.applicant} — {g.product}</p>
              <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>
                Loan: KES {fmtMoneyPlain(g.amountCents)} · your guarantee: <strong style={{ color: 'var(--t-text)' }}>KES {fmtMoneyPlain(g.guaranteedAmountCents)}</strong>
              </p>
              <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>Ref {g.applicationNumber} · expires {fmtDate(g.expiresAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={badgeClass[statusBadge(g.status).tone]}>{statusBadge(g.status).label}</Badge>
              {g.status === 'PENDING' && (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-[var(--t-success)] text-white hover:brightness-110" onClick={() => respond.mutate({ id: g.id, decision: 'accept' })}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: g.id, decision: 'decline' })}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )) : (
        <div className="public-card section-pad text-center">
          <Users className="mx-auto h-10 w-10 opacity-40" />
          <p className="mt-2 text-sm" style={{ color: 'var(--t-muted-text)' }}>No guarantor requests. When someone names you, it appears here with an email + SMS alert.</p>
        </div>
      )}
    </div>
  );
}
