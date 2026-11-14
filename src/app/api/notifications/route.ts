// Member-scoped notifications (own bell) — guide §16.4.
import { withAuth, ok, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';

export const GET = withAuth(null, async ({ session }) => {
  const rows = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return ok(rows.map((n) => ({
    id: n.id, title: n.title, body: n.body, type: n.type, link: n.link ?? '',
    read: Boolean(n.readAt), createdAt: n.createdAt,
  })));
});

export const PATCH = withAuth(null, async ({ req, session }) => {
  const { id } = await body(req, z.object({ id: z.string().optional() }));
  if (id) {
    await db.notification.updateMany({ where: { id, userId: session.user.id }, data: { readAt: new Date() } });
  } else {
    await db.notification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  }
  return ok({ read: true });
});
