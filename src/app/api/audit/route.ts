// Audit trail viewer — append-only, filterable, exportable (guide §17.2.4).
import { withAuth, ok, query } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('audit_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.auditLog.findMany({
    where: {
      ...(q.module ? { module: q.module } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: { contains: q.action.toUpperCase() } } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
      ...(q.search ? { OR: [{ action: { contains: q.search } }, { entity: { contains: q.search } }, { entityId: { contains: q.search } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 800,
  });
  return ok(rows.map((r) => ({
    id: r.id, action: r.action, module: r.module, entity: r.entity, entityId: r.entityId ?? '',
    userId: r.userId ?? '', severity: r.severity,
    ip: r.ip ?? '', createdAt: r.createdAt,
    before: r.before ?? null, after: r.after ?? null,
  })));
});
