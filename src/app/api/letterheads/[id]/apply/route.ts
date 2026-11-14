// Letterheads — list + set active (guide §7.2).
import { withAuth, withPermission, ok, err } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => {
  const rows = await db.letterhead.findMany({ orderBy: { name: 'asc' } });
  return ok(rows.map((l) => ({
    id: l.id, name: l.name, active: l.active, system: l.system, design: l.design,
  })));
});

export const POST = withPermission('settings_letterheads', async ({ params, session }) => {
  const { id } = params;
  const lh = await db.letterhead.findUnique({ where: { id } });
  if (!lh) return err('Letterhead not found', 404);
  await db.letterhead.updateMany({ data: { active: false } });
  await db.letterhead.update({ where: { id }, data: { active: true } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'LETTERHEAD_APPLY', module: 'settings', entity: 'Letterhead', entityId: id, after: { name: lh.name }, severity: 'info' });
  return ok({ applied: lh.name });
});
