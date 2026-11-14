// Member profile (own) + statements requests — guide §8.5/§12.2.3.
import { withAuth, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sanitizeHtml } from '@/lib/core-utils';

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const m = await db.memberProfile.findUnique({
    where: { id: memberId },
    include: { nextOfKins: true, beneficiaries: true, user: { select: { email: true, lastLoginAt: true } } },
  });
  if (!m) return err('Member not found', 404);
  return ok(m);
});

const patchSchema = z.object({
  phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/).optional(),
  altPhone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  physicalAddress: z.string().min(4).optional(),
  town: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  employerName: z.string().nullable().optional(),
  nextOfKin: z.object({ name: z.string().min(3), relationship: z.string().min(2), phone: z.string(), email: z.string().email().optional(), idNumber: z.string().optional(), percentage: z.coerce.number().int().min(0).max(100).optional() }).optional(),
});

export const PATCH = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const d = await body(req, patchSchema);
  const before = await db.memberProfile.findUnique({ where: { id: memberId } });
  const { nextOfKin, ...rest } = d;
  if (Object.keys(rest).length) {
    await db.memberProfile.update({ where: { id: memberId }, data: rest });
  }
  if (nextOfKin) {
    await db.nextOfKin.create({ data: { ...nextOfKin, memberProfileId: memberId } });
  }
  await (await import('@/lib/audit')).audit({
    userId: session.user.id, userRole: session.user.role,
    action: 'MEMBER_SELF_UPDATE', module: 'members', entity: 'MemberProfile', entityId: memberId,
    before, after: d, severity: 'info',
  });
  return ok({ updated: true });
});
