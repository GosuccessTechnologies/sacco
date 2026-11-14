// Next of kin CRUD — guide §8.4.
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  name: z.string().min(3), relationship: z.string().min(2), phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/),
  email: z.string().email().optional().nullable(), idNumber: z.string().optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(), percentage: z.coerce.number().int().min(0).max(100).optional().nullable(),
});

export const GET = withAuth('members_view', async ({ params }) => {
  const { id } = params;
  return ok(await db.nextOfKin.findMany({ where: { memberProfileId: id }, orderBy: { createdAt: 'asc' } }));
});

export const POST = withPermission('members_edit', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const row = await db.nextOfKin.create({ data: { ...d, memberProfileId: id } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'KIN_CREATE', module: 'members', entity: 'NextOfKin', entityId: row.id, after: d });
  return ok(row);
});
