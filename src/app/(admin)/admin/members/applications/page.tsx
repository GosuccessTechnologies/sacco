'use client';
// Membership applications review — guide §8.6 (two-pane, approve = atomic provisioning).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, CheckCircle2, XCircle, Eye, Inbox } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader, ConfirmDialog } from '@/components/kit/kit-bits';
import { toast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { fmtDate, badgeClass, statusBadge } from '@/lib/client-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [review, setReview] = React.useState<{ id: string; applicationNumber: string; decision: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = React.useState('');

  const { data: rows = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => (await fetch('/api/applications')).json(),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: string; reason?: string }) => {
      const res = await fetch(`/api/applications/${id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Review failed');
      return data;
    },
    onSuccess: (data: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      if (vars.decision === 'approve') {
        toast({ title: `Approved — member ${data.memberNumber} provisioned`, description: `Main account: ${data.accountNumber ?? '—'}. Temp password emailed${data.tempPassword ? ` (${data.tempPassword})` : ''}.` });
      } else {
        toast({ title: 'Application rejected — applicant notified' });
      }
    },
    onError: (e: Error) => toast({ title: 'Review failed', description: e.message, variant: 'destructive' }),
  });

  const columns: ColumnSpec<any>[] = [
    { key: 'applicationNumber', header: 'Ref', type: 'text', defaultVisible: true, filter: 'text' },
    { key: 'name', header: 'Applicant', type: 'text', defaultVisible: true },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true, filter: 'select' },
    { key: 'phone', header: 'Phone', type: 'text', defaultVisible: true },
    { key: 'nationalId', header: 'ID No', type: 'text' },
    { key: 'email', header: 'Email', type: 'text' },
    { key: 'county', header: 'County', type: 'text' },
    { key: 'occupation', header: 'Occupation', type: 'text' },
    { key: 'source', header: 'Source', type: 'badge' },
    { key: 'products', header: 'Products of interest', type: 'text' },
    { key: 'appliedAt', header: 'Applied', type: 'datetime' },
  ];

  const pending = rows.filter((r: any) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW');

  return (
    <>
      <PageHeader icon={FileCheck2} title="Membership Applications" description={`${pending.length} awaiting review · approve to provision member + portal + main account atomically.`} />
      <DataTable
        id="applications"
        title="Applications"
        subtitle="Online + office-created applications"
        data={rows}
        columns={columns}
        searchKeys={['applicationNumber', 'name', 'nationalId', 'phone']}
        exportPermission="members_export"
        actions={[
          { label: 'Approve', icon: CheckCircle2, color: 'approve', show: (r: any) => can('members_create') && ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status), onClick: (r: any) => { setReason(''); setReview({ id: r.id, applicationNumber: r.applicationNumber, decision: 'approve' }); } },
          { label: 'Reject', icon: XCircle, color: 'reject', show: (r: any) => can('members_create') && ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status), onClick: (r: any) => { setReason(''); setReview({ id: r.id, applicationNumber: r.applicationNumber, decision: 'reject' }); } },
        ]}
        emptyMessage="No applications yet — they arrive from the public website /apply page."
      />

      <ConfirmDialog
        open={Boolean(review)}
        onOpenChange={() => setReview(null)}
        title={review?.decision === 'approve' ? `Approve ${review?.applicationNumber}?` : `Reject ${review?.applicationNumber}?`}
        description={review?.decision === 'approve'
          ? 'Approval provisions the member profile, portal login, main savings account and share position in one transaction, then emails the welcome credentials.'
          : 'The applicant is notified by email/SMS with the reason you provide below.'}
        confirmLabel={review?.decision === 'approve' ? 'Approve & provision' : 'Reject'}
        danger={review?.decision === 'reject'}
        onConfirm={async () => {
          if (!review) return;
          await reviewMutation.mutateAsync({ id: review.id, decision: review.decision, reason: reason || 'Not stated' });
        }}
      >
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / notes (sent to applicant on rejection)"
               className="dsms-input h-10 w-full" aria-label="Reason" />
      </ConfirmDialog>
    </>
  );
}
