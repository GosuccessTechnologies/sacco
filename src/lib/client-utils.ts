// Client-safe helpers — money display, badges, dates (mirror of server money.ts)
export function fmtMoney(cents: number, currency = 'KES'): string {
  const neg = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${neg}${currency} ${whole}.${dec}`;
}
export function fmtMoneyPlain(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(abs % 100).toString().padStart(2, '0')}`;
}
export function parseMoney(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input).replace(/[KES\s,]/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error('Invalid amount');
  const [w, d = ''] = cleaned.split('.');
  return parseInt(w, 10) * 100 + parseInt((d + '00').slice(0, 2), 10);
}
export function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })} ${dt.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`;
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
export const badgeClass: Record<BadgeTone, string> = {
  success: 'bg-[var(--t-success)]/12 text-[var(--t-success)] border-[var(--t-success)]/30',
  warning: 'bg-[var(--t-warning)]/12 text-[var(--t-warning)] border-[var(--t-warning)]/30',
  danger: 'bg-[var(--t-danger)]/12 text-[var(--t-danger)] border-[var(--t-danger)]/30',
  info: 'bg-[var(--t-info)]/12 text-[var(--t-info)] border-[var(--t-info)]/30',
  neutral: 'bg-[var(--t-muted-text)]/10 text-[var(--t-muted-text)] border-[var(--t-border)]',
  primary: 'bg-[var(--t-primary)]/12 text-[var(--t-primary)] border-[var(--t-primary)]/30',
};

export function statusBadge(status: string): { label: string; tone: BadgeTone } {
  const map: Record<string, [string, BadgeTone]> = {
    ACTIVE: ['Active', 'success'], OPEN: ['Open', 'success'], APPROVED: ['Approved', 'success'],
    ACCEPTED: ['Accepted', 'success'], COMPLETED: ['Completed', 'success'], PAID: ['Paid', 'success'],
    SENT: ['Sent', 'success'], POSTED: ['Posted', 'success'], CLEARED: ['Cleared', 'success'],
    SUCCESS: ['Success', 'success'], CONNECTED: ['Connected', 'success'],
    PENDING: ['Pending', 'warning'], PARTIAL: ['Partial', 'warning'], UNDER_REVIEW: ['In review', 'warning'],
    GUARANTOR_PENDING: ['Guarantors pending', 'warning'], PENDING_CLEARING: ['Clearing', 'warning'],
    PENDING_CONFIG: ['Needs config', 'warning'], DRAFT: ['Draft', 'neutral'], QUEUED: ['Queued', 'warning'],
    INITIATED: ['Initiated', 'info'], SUBMITTED: ['Submitted', 'info'],
    REJECTED: ['Rejected', 'danger'], FAILED: ['Failed', 'danger'], DECLINED: ['Declined', 'danger'],
    OVERDUE: ['Overdue', 'danger'], DEFAULTED: ['Defaulted', 'danger'], BLACKLISTED: ['Blacklisted', 'danger'],
    BOUNCED: ['Bounced', 'danger'], ERROR: ['Error', 'danger'], DISABLED: ['Disabled', 'neutral'],
    SUSPENDED: ['Suspended', 'warning'], FROZEN: ['Frozen', 'info'], DORMANT: ['Dormant', 'neutral'],
    CLOSED: ['Closed', 'neutral'], EXITED: ['Exited', 'neutral'], WRITTEN_OFF: ['Written off', 'danger'],
    REVERSED: ['Reversed', 'neutral'], CANCELLED: ['Cancelled', 'neutral'], EXPIRED: ['Expired', 'neutral'],
    UNALLOCATED: ['Unallocated', 'warning'], TIMEOUT: ['Timeout', 'danger'],
    DISBURSED: ['Disbursed', 'primary'], VETTING: ['Vetting', 'info'],
  };
  const [label, tone] = map[status] ?? [status, 'neutral' as BadgeTone];
  return { label, tone };
}
