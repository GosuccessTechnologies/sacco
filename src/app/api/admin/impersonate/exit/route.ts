// Exit impersonation — restore super admin session (guide §17.2.3).
import { withAuth, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { unstable_update } from '@/lib/auth';

export const POST = withAuth(null, async ({ session }) => {
  if (!session.user.actAsBy) return ok({ exited: false });
  const original = await db.user.findUnique({ where: { id: session.user.actAsBy } });
  const logs = await db.impersonationLog.findMany({
    where: { targetUserId: session.user.actAs, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (logs[0]) {
    await db.impersonationLog.update({ where: { id: logs[0].id }, data: { endedAt: new Date() } });
  }
  if (unstable_update && original) {
    const snapshot = await import('@/lib/rbac').then((m) => m.computeSnapshot(original.role, original.designation, original.permissions));
    await unstable_update({
      newRole: original.role,
      newDesignation: original.designation,
      newPermissions: snapshot.permissions,
      newMemberId: original.memberProfile?.id ?? null,
      newActAs: null,
      newActAsBy: null,
      clearActAs: true,
    } as never).catch(() => null);
  }
  await audit({ userId: session.user.actAsBy, userRole: 'SUPER_ADMIN', action: 'IMPERSONATE_EXIT', module: 'users', entity: 'ImpersonationLog', entityId: logs[0]?.id ?? '', severity: 'warn' });
  return ok({ exited: true });
});
