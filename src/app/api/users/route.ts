// Users list + create — guide §17.4 (three roles, designations for ADMIN).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { audit } from '@/lib/audit';
import { computeSnapshot } from '@/lib/rbac';
import { randomBytes } from 'node:crypto';

export const GET = withAuth('users_view', async () => {
  const rows = await db.user.findMany({
    where: { deletedAt: null },
    include: { memberProfile: { select: { memberNumber: true } }, staffProfile: { select: { staffNo: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return ok(rows.map((u) => ({
    id: u.id, name: u.name, email: u.email, phone: u.phone ?? '',
    role: u.role, designation: u.designation ?? '', status: u.status,
    memberNumber: u.memberProfile?.memberNumber ?? '', staffNo: u.staffProfile?.staffNo ?? '',
    lastLoginAt: u.lastLoginAt, mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil,
  })));
});

const schema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MEMBER']),
  designation: z.string().optional().nullable(),
  permissions: z.array(z.string()).optional(),
});

export const POST = withPermission('users_manage', async ({ req, session }) => {
  const d = await body(req, schema);
  const dup = await db.user.findUnique({ where: { email: d.email } });
  if (dup) return err('Email already in use', 409);
  const tempPassword = `Divine@${randomBytes(3).toString('hex')}`;
  const user = await db.user.create({
    data: {
      name: d.name, email: d.email, phone: d.phone ?? null,
      role: d.role, designation: d.designation ?? null,
      permissions: d.permissions ?? undefined,
      passwordHash: hashPassword(tempPassword), status: 'ACTIVE', mustChangePassword: true,
    },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'USER_CREATE', module: 'users', entity: 'User', entityId: user.id, after: { email: d.email, role: d.role }, severity: 'critical' });
  return ok({ id: user.id, tempPassword });
});

export const PATCH = withPermission('users_manage', async ({ req, session }) => {
  const d = await body(req, schema.partial().extend({
    id: z.string(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
  }));
  const { id, ...rest } = d;
  if (id === session.user.id && rest.status === 'DISABLED') return err('You cannot disable your own account', 400);
  const target = await db.user.findUnique({ where: { id } });
  if (target?.role === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') return err('Only super admins can modify super admins', 403);
  const user = await db.user.update({ where: { id }, data: rest });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'USER_UPDATE', module: 'users', entity: 'User', entityId: id, after: rest, severity: 'warn' });
  return ok({ id: user.id, status: user.status });
});
