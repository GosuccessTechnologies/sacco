// File manager listing (grouped by module & date) — guide §7.5.
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export const GET = withAuth('files_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.fileRecord.findMany({
    where: {
      ...(q.module ? { moduleName: q.module } : {}),
      ...(q.search ? { originalName: { contains: q.search } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  // group tree by module → YYYY-MM
  const tree: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const month = r.createdAt.toISOString().slice(0, 7);
    tree[r.moduleName] ??= {};
    tree[r.moduleName][month] = (tree[r.moduleName][month] ?? 0) + 1;
  }
  return ok({
    files: rows.map((f) => ({
      id: f.id, moduleName: f.moduleName, originalName: f.originalName,
      url: f.externalUrl ?? `/api/files/${f.id}/raw`,
      external: Boolean(f.externalUrl),
      mime: f.mime, size: f.size, originalSize: f.originalSize,
      compressed: f.compressed, source: f.source,
      uploadedById: f.uploadedById ?? '', createdAt: f.createdAt,
    })),
    tree,
  });
});

export const DELETE = withPermission('files_delete', async ({ req, session }) => {
  const { id } = await body(req, (await import('zod')).z.object({ id: z.string() }));
  const rec = await db.fileRecord.findUnique({ where: { id } });
  if (!rec) return err('File not found', 404);
  if (rec.storedName) {
    await unlink(path.join(process.cwd(), 'data', 'uploads', rec.storedName)).catch(() => null);
  }
  await db.fileRecord.delete({ where: { id } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'FILE_DELETE', module: 'files', entity: 'FileRecord', entityId: id, severity: 'warn' });
  return ok({ deleted: true });
});
