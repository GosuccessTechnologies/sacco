// Cross-login (impersonation) — view-only, audited (guide §17.2.3).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { computeSnapshot } from '@/lib/rbac';

export const POST = withPermission('users_impersonate', async ({ req, session }) => {
  const { userId, reason } = await body(req, z.object({ userId: z.string(), reason: z.string().min(5) }));
  const target = await db.user.findUnique({ where: { id: userId }, include: { memberProfile: true } });
  if (!target) return err('User not found', 404);
  if (target.role === 'SUPER_ADMIN') return err('Cannot impersonate another super admin', 403);
  const snapshot = await computeSnapshot(target.role, target.designation, target.permissions);
  const log = await db.impersonationLog.create({
    data: { superAdminId: session.user.id, targetUserId: target.id, reason, startedAt: new Date() },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'IMPERSONATE_START', module: 'users', entity: 'ImpersonationLog', entityId: log.id, after: { target: target.email, reason }, severity: 'critical' });
  // unstable_update swaps session claims to the target while keeping actAs markers
  const { unstable_update } = await import('@/lib/auth');
  if (unstable_update) {
    await unstable_update({
      newRole: target.role,
      newDesignation: target.designation,
      newPermissions: snapshot.permissions,
      newMemberId: target.memberProfile?.id ?? null,
      newActAs: target.id,
      newActAsBy: session.user.id,
    } as never).catch(() => null);
  }
  return ok({
    actAs: {
      id: target.id, name: target.name, email: target.email, role: target.role,
      designation: target.designation, permissions: snapshot.permissions,
      memberId: target.memberProfile?.id ?? null,
    },
    logId: log.id,
  });
});
