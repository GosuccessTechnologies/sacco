// Chart of accounts — tree + create/update (guide §13.4).
import { withAuth, withPermission, ok, body, err } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => {
  const rows = await db.glAccount.findMany({ orderBy: { code: 'asc' } });
  return ok(rows.map((a) => ({
    id: a.id, code: a.code, name: a.name, type: a.type, parentId: a.parentId,
    isPostable: a.isPostable, active: a.active, cachedBalanceCents: a.cachedBalanceCents,
  })));
});

const schema = z.object({
  code: z.string().regex(/^\d{3,6}$/), name: z.string().min(3), type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  parentId: z.string().optional().nullable(), isPostable: z.boolean().default(true),
});

export const POST = withPermission('accounting_coa', async ({ req, session }) => {
  const d = await body(req, schema);
  const dup = await db.glAccount.findUnique({ where: { code: d.code } });
  if (dup) return err('Code already exists', 409);
  const row = await db.glAccount.create({ data: d });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'COA_CREATE', module: 'accounting', entity: 'GlAccount', entityId: row.id, after: d, severity: 'warn' });
  return ok(row);
});

export const PATCH = withPermission('accounting_coa', async ({ req, session }) => {
  const d = await body(req, schema.partial().extend({ id: z.string() }));
  const { id, ...rest } = d;
  const row = await db.glAccount.update({ where: { id }, data: rest });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'COA_UPDATE', module: 'accounting', entity: 'GlAccount', entityId: id, after: rest, severity: 'warn' });
  return ok(row);
});
