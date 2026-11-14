'use client';
// StatCard (dashboard pages only), PageHeader, ConfirmDialog — guide §7.3/§7.9.
import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fmtMoneyPlain } from '@/lib/client-utils';

export function StatCard({ icon: Icon, label, value, sub, tone = 'primary', trend }: { icon: LucideIcon; label: string; value: string | number; sub?: string; tone?: 'primary' | 'success' | 'warning' | 'info' | 'danger'; trend?: number }) {
  const toneVar = { primary: 'var(--t-primary)', success: 'var(--t-success)', warning: 'var(--t-warning)', info: 'var(--t-info)', danger: 'var(--t-danger)' }[tone];
  return (
    <Card className="section-pad relative overflow-hidden border" style={{ borderColor: 'var(--t-border)' }}>
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: toneVar }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--t-muted-text)]">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--t-heading-font)' }}>
            {typeof value === 'number' ? fmtMoneyPlain(value) : value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-[var(--t-muted-text)]">{sub}</p>}
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${toneVar} 14%, transparent)`, color: toneVar }}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {trend !== undefined && (
        <p className={`mt-2 text-xs font-semibold ${trend >= 0 ? 'text-[var(--t-success)]' : 'text-[var(--t-danger)]'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs last month
        </p>
      )}
    </Card>
  );
}

export function PageHeader({ icon: Icon, title, description, actions }: { icon: LucideIcon; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="card-hero grid h-11 w-11 place-items-center rounded-xl">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: 'var(--t-heading-font)' }}>{title}</h1>
          {description && <p className="text-sm text-[var(--t-muted-text)]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', danger = false, onConfirm, busy, children,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string;
  confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; busy?: boolean;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className={danger ? 'bg-[var(--t-danger)] text-white' : 'card-hero'} style={{ padding: '1rem 1.25rem' }}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription className={danger ? 'text-white/90' : 'opacity-90'}>{description}</DialogDescription>
        </DialogHeader>
        {children && <div className="px-5 pt-4">{children}</div>}
        <DialogFooter className="border-t bg-[var(--t-surface)] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending || busy}>Cancel</Button>
          <Button
            disabled={pending || busy}
            className={danger ? 'bg-[var(--t-danger)] text-white hover:brightness-110' : 'bg-[var(--t-primary)] text-white'}
            onClick={async () => {
              setPending(true);
              try { await onConfirm(); onOpenChange(false); }
              finally { setPending(false); }
            }}
          >
            {pending || busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
