// Message templates — list + update (guide §16.4).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => {
  const rows = await db.messageTemplate.findMany({ orderBy: [{ code: 'asc' }, { channel: 'asc' }] });
  return ok(rows.map((t) => ({
    id: t.id, code: t.code, channel: t.channel, subject: t.subject ?? '',
    body: t.body, category: t.category, active: t.active,
    excerpt: t.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
  })));
});

export const PATCH = withPermission('comms_templates', async ({ req, session }) => {
  const d = await body(req, z.object({
    id: z.string(),
    subject: z.string().optional(),
    body: z.string().optional(),
    active: z.boolean().optional(),
  }));
  const { id, ...rest } = d;
  if (rest.body !== undefined && typeof rest.body === 'string' && rest.body.includes('<')) {
    const { sanitizeHtml } = await import('@/lib/core-utils');
    rest.body = sanitizeHtml(rest.body);
  }
  const row = await db.messageTemplate.update({ where: { id }, data: rest });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'TEMPLATE_UPDATE', module: 'comms', entity: 'MessageTemplate', entityId: id, after: rest, severity: 'info' });
  return ok(row);
});
