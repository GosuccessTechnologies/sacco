// Broadcast sender — guide §16.2.2 (branded email + chunked SMS, per-recipient log).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { broadcast } from '@/lib/notify';
import { audit } from '@/lib/audit';
import { sanitizeHtml } from '@/lib/core-utils';
import { rateLimit } from '@/lib/api';

const schema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'BOTH']),
  subject: z.string().min(3).max(160),
  bodyHtml: z.string().min(10),
  groupId: z.string(),
  marketing: z.boolean().default(true),
});

async function resolveGroupRecipients(groupId: string): Promise<{ name?: string | null; email?: string | null; phone?: string | null }[]> {
  const g = await db.contactGroup.findUnique({ where: { id: groupId } });
  if (!g) return [];
  switch (g.source) {
    case 'SUBSCRIBERS': {
      const rows = await db.subscriber.findMany({ where: { status: 'ACTIVE' } });
      return rows.map((s) => ({ name: s.name, email: s.email, phone: s.phone }));
    }
    case 'ACTIVE_MEMBERS': {
      const rows = await db.memberProfile.findMany({ where: { status: 'ACTIVE' } });
      return rows.map((m) => ({ name: `${m.firstName} ${m.lastName}`, email: m.email, phone: m.phone }));
    }
    case 'LOAN_DUE': {
      const today = new Date();
      const loans = await db.loan.findMany({ where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } }, include: { memberProfile: true, schedule: true } });
      const due = loans.filter((l) => l.schedule.some((s) => s.dueDate >= today && s.dueDate <= new Date(today.getTime() + 7 * 86400000) && s.paidCents < s.totalDueCents));
      const seen = new Set<string>();
      return due.filter((l) => (seen.has(l.memberProfile.id) ? false : seen.add(l.memberProfile.id)))
        .map((l) => ({ name: l.memberProfile.firstName, email: l.memberProfile.email, phone: l.memberProfile.phone }));
    }
    case 'SHAREHOLDERS': {
      const rows = await db.memberSharePosition.findMany({ where: { totalShares: { gt: 0 } }, include: { memberProfile: true } });
      return rows.map((p) => ({ name: p.memberProfile.firstName, email: p.memberProfile.email, phone: p.memberProfile.phone }));
    }
    case 'CUSTOM_CSV': return (g.materializedContacts as any[]) ?? [];
    default: return [];
  }
}

export const POST = withPermission('comms_send', async ({ req, session }) => {
  if (!rateLimit(`broadcast:${session.user.id}`, 10, 600_000)) {
    return err('Too many broadcasts in a short window — wait a few minutes', 429);
  }
  const d = await body(req, schema);
  const recipients = await resolveGroupRecipients(d.groupId);
  if (!recipients.length) return err('This group has no recipients', 400);
  const safeBody = d.bodyHtml.includes('<') ? sanitizeHtml(d.bodyHtml) : d.bodyHtml;
  const result = await broadcast(d.channel, d.subject, d.channel === 'EMAIL' ? safeBody : safeBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), recipients, session.user.id, d.marketing);
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'BROADCAST_SEND', module: 'comms', entity: 'MessageLog', entityId: result.logId, after: { channel: d.channel, sent: result.sent, failed: result.failed, recipients: recipients.length }, severity: 'info' });
  return ok(result);
});
