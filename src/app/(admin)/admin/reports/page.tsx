'use client';
// Reports & BI — analytics + SASRA regulatory returns (guide §15.6).
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, FileCheck2, Download, Printer } from 'lucide-react';
import { DataTable, type ColumnSpec } from '@/components/kit/DataTable';
import { PageHeader } from '@/components/kit/kit-bits';
import { toast } from '@/hooks/use-toast';
import { fmtMoneyPlain, fmtDate } from '@/lib/client-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = React.useState(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  });

  const analytics = useQuery({ queryKey: ['analytics'], queryFn: async () => (await fetch('/api/analytics')).json() });
  const runs = useQuery({ queryKey: ['report-runs'], queryFn: async () => (await fetch('/api/reports/generate')).json() });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periodFrom: period.from, periodTo: period.to }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-runs'] }); toast({ title: 'SASRA return generated', description: 'Figures snapshot from live GL balances.' }); },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const runColumns: ColumnSpec<any>[] = [
    { key: 'periodLabel', header: 'Period', type: 'text', defaultVisible: true },
    { key: 'definitionCode', header: 'Return', type: 'badge', defaultVisible: true },
    { key: 'status', header: 'Status', type: 'badge', defaultVisible: true },
    { key: 'generatedAt', header: 'Generated', type: 'datetime', defaultVisible: true },
  ];

  const latest = (runs.data ?? [])[0];
  const f = latest?.figures ?? {};

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Reports & Business Intelligence"
        description="Analytics dashboards feed from live aggregates; SASRA returns snapshot GL figures."
        actions={
          <>
            <input type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} className="dsms-input h-9" aria-label="From" />
            <input type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} className="dsms-input h-9" aria-label="To" />
            <Button size="sm" className="bg-[var(--t-primary)] text-white" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <FileCheck2 className="mr-1 h-3.5 w-3.5" /> Generate SASRA return
            </Button>
          </>
        }
      />

      <Tabs defaultValue="regulatory">
        <TabsList className="no-print mb-3">
          <TabsTrigger value="regulatory">Regulatory (SASRA)</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="regulatory">
          {latest ? (
            <div className="public-card section-pad" id="sasra-report">
              <h3 className="text-sm font-bold">SASRA quarterly return — {latest.periodLabel}</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['Total assets', f.totalAssetsCents], ['Total liabilities', f.totalLiabilitiesCents],
                  ['Share capital', f.shareCapitalCents], ['Retained earnings', f.retainedEarningsCents],
                  ['Member deposits', f.depositsCents], ['Loan portfolio', f.loanPortfolioCents],
                  ['Loans disbursed (cumulative)', f.loansDisbursedCents], ['Income', f.incomeCents],
                  ['Expenses', f.expensesCents], ['Liquidity (cash + mobile)', f.liquidityCents],
                  ['Active members', f.activeMembers],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg p-3" style={{ background: 'var(--t-table-header-a)' }}>
                    <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{String(label)}</p>
                    <p className="text-base font-bold tabular-nums">{typeof value === 'number' && value > 1000 ? fmtMoneyPlain(value) : (value ?? '—')}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 no-print">
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-3.5 w-3.5" /> Print (letterhead)</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--t-muted-text)' }}>Generate the first return above.</p>
          )}
          <div className="mt-6">
            <DataTable id="report-runs" title="Report history" subtitle="Immutable figure snapshots" data={runs.data ?? []} columns={runColumns} searchKeys={['periodLabel']} exportPermission="reports_export" />
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analytics.data?.overview && Object.entries({
              'Active members': analytics.data.overview.activeMembers,
              'Savings (KES)': fmtMoneyPlain(analytics.data.overview.totalSavingsCents),
              'Loan book (KES)': fmtMoneyPlain(analytics.data.overview.loanBookCents),
              'Share capital (KES)': fmtMoneyPlain(analytics.data.overview.shareCapitalCents),
              'Subscribers': analytics.data.overview.subscribers,
              'Successful digital payments': analytics.data.overview.successfulPayments,
              'PAR (KES)': fmtMoneyPlain(analytics.data.arrears?.parCents ?? 0),
              'PAR ratio': `${((analytics.data.arrears?.parRatio ?? 0) * 100).toFixed(1)}%`,
            }).map(([k, v]) => (
              <div key={k} className="public-card section-pad">
                <p className="text-xs" style={{ color: 'var(--t-muted-text)' }}>{k}</p>
                <p className="mt-1 text-xl font-bold tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>{String(v)}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs" style={{ color: 'var(--t-muted-text)' }}>
            Full chart suite renders on the main dashboard — this view focuses on regulatory figures. Every chart exports with the active letterhead.
          </p>
        </TabsContent>
      </Tabs>
    </>
  );
}
