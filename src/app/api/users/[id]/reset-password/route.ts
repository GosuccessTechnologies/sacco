// Reset user password (temp + forced change) — guide §17.2.2.
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { audit } from '@/lib/audit';
import { randomBytes } from 'node:crypto';

export const POST = withPermission('users_manage', async ({ req, params, session }) => {
  const { id } = params;
  const { newPassword } = await body(req, z.object({ newPassword: z.string().min(10).optional() }));
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return err('User not found', 404);
  if (user.role === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') return err('Only super admins can reset super admins', 403);
  const temp = newPassword ?? `Divine@${randomBytes(3).toString('hex')}`;
  await db.user.update({
    where: { id },
    data: { passwordHash: hashPassword(temp), mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'USER_RESET_PASSWORD', module: 'users', entity: 'User', entityId: id, severity: 'critical' });
  return ok({ tempPassword: temp });
});
