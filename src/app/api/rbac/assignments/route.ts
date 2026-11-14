// RBAC matrix — designations × permissions (guide §17.2.1).
import { withAuth, withPermission, ok, body, err } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { DESIGNATIONS, PERMISSIONS, DESIGNATION_PERMISSIONS, type PermissionKey } from '@/lib/constants';
import { audit } from '@/lib/audit';

export const GET = withAuth('users_view', async () => {
  const rows = await db.permissionAssignment.findMany();
  const matrix: Record<string, PermissionKey[]> = {};
  for (const d of DESIGNATIONS) {
    matrix[d] = rows.filter((r) => r.designation === d).map((r) => r.permissionKey as PermissionKey);
    if (!matrix[d].length) matrix[d] = DESIGNATION_PERMISSIONS[d];
  }
  return ok({ designations: DESIGNATIONS, permissions: Object.keys(PERMISSIONS), matrix });
});

export const PUT = withPermission('rbac_manage', async ({ req, session }) => {
  const d = await body(req, z.object({
    matrix: z.record(z.string(), z.array(z.string())),
  }));
  for (const [designation, perms] of Object.entries(d.matrix)) {
    const valid = (perms as string[]).filter((p) => p in PERMISSIONS);
    await db.permissionAssignment.deleteMany({ where: { designation } });
    for (const p of valid) {
      await db.permissionAssignment.create({ data: { designation, permissionKey: p } });
    }
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'RBAC_MATRIX_SAVE', module: 'rbac', entity: 'PermissionAssignment', after: { designations: Object.keys(d.matrix) }, severity: 'critical' });
  return ok({ saved: true, note: 'Active sessions keep their snapshot until refresh — ask staff to re-login' });
});
