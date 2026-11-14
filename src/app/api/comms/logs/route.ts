// Delivery logs with per-recipient drilldown — guide §16.4.
import { withAuth, ok, query } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('comms_logs', async ({ req }) => {
  const q = query(req);
  const rows = await db.messageLog.findMany({
    where: q.logId ? { id: q.logId } : {},
    include: q.logId ? { recipients: true } : { _count: { select: { recipients: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return ok(rows.map((l) => ({
    id: l.id, channel: l.channel, subject: l.subject ?? '',
    recipientsCount: l.recipientsCount ?? (l as any)._count?.recipients ?? 0,
    status: l.status, sentAt: l.sentAt, createdAt: l.createdAt,
    recipients: (l as any).recipients
      ? (l as any).recipients.map((r: any) => ({ name: r.contactName, channel: r.email ? 'email' : 'sms', status: r.status, error: r.error ?? '' }))
      : undefined,
  })));
});
