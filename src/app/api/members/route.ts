// Members list + create — guide §8.4.
import { withAuth, withPermission, query, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { nextSequence } from '@/lib/core-utils';
import { hashPassword } from '@/lib/password';
import { notifyPerson, inAppNotify } from '@/lib/notify';
import { openSavingsAccount } from '@/lib/savings/service';
import { PERMISSIONS } from '@/lib/constants';
import { randomBytes } from 'node:crypto';

const createSchema = z.object({
  firstName: z.string().min(2), middleName: z.string().optional().nullable(), lastName: z.string().min(2),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']), dateOfBirth: z.coerce.date(),
  nationalId: z.string().regex(/^\d{6,12}$/), passportNo: z.string().optional().nullable(), kraPin: z.string().optional().nullable(),
  phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/), altPhone: z.string().optional().nullable(), email: z.string().email().optional().nullable(),
  physicalAddress: z.string().min(4), town: z.string().optional().nullable(), county: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(), occupation: z.string().optional().nullable(),
  employerName: z.string().optional().nullable(), monthlyIncomeCents: z.coerce.number().int().min(0).default(0),
  nextOfKins: z.array(z.object({ name: z.string().min(3), relationship: z.string(), phone: z.string(), email: z.string().email().optional(), idNumber: z.string().optional(), percentage: z.coerce.number().int().min(0).max(100).optional() })).min(1),
  createPortalAccount: z.boolean().default(true),
});

export const GET = withAuth('members_view', async ({ req, session }) => {
  const q = query(req);
  const canPii = session.user.role === 'SUPER_ADMIN' || session.user.permissions.includes('members_view_pii');
  const rows = await db.memberProfile.findMany({
    where: {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { memberNumber: { contains: q.search } }] } : {}),
    },
    include: { user: { select: { email: true, status: true } }, sharePosition: true, _count: { select: { savingsAccounts: true, loans: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return ok(rows.map((r) => ({
    id: r.id, memberNumber: r.memberNumber,
    name: `${r.firstName} ${r.middleName ?? ''} ${r.lastName}`.replace(/\s+/g, ' '),
    gender: r.gender, phone: canPii ? r.phone : '•••••' + r.phone.slice(-3),
    email: canPii ? (r.email ?? r.user?.email ?? '') : '•••@•••',
    nationalId: canPii ? r.nationalId : '•••••' + r.nationalId.slice(-3),
    status: r.status, kycVerified: r.kycVerified, joinedAt: r.joinedAt,
    savingsAccounts: r._count.savingsAccounts, openLoans: r._count.loans,
    shares: r.sharePosition?.totalShares ?? 0,
    portalStatus: r.user?.status ?? '—',
  })));
});

export const POST = withPermission('members_create', async ({ req, session }) => {
  const d = await body(req, createSchema);
  const dup = await db.memberProfile.findFirst({ where: { nationalId: d.nationalId } });
  if (dup) return err('A member with this national ID already exists', 409);
  const dupUser = d.email ? await db.user.findUnique({ where: { email: d.email } }) : null;
  if (dupUser) return err('A user with this email already exists', 409);

  const tempPassword = `Divine@${randomBytes(3).toString('hex')}`;
  const memberNumber = await nextSequence(db, 'member');
  const result = await db.$transaction(async (tx) => {
    let userId: string | null = null;
    if (d.createPortalAccount && d.email) {
      const user = await tx.user.create({
        data: { email: d.email, phone: d.phone, name: `${d.firstName} ${d.lastName}`, role: 'MEMBER', passwordHash: hashPassword(tempPassword), status: 'ACTIVE', mustChangePassword: true },
      });
      userId = user.id;
    }
    const profile = await tx.memberProfile.create({
      data: {
        userId, memberNumber,
        firstName: d.firstName, middleName: d.middleName ?? null, lastName: d.lastName,
        gender: d.gender, dateOfBirth: d.dateOfBirth, nationalId: d.nationalId,
        passportNo: d.passportNo ?? null, kraPin: d.kraPin ?? null,
        phone: d.phone, altPhone: d.altPhone ?? null, email: d.email ?? null,
        physicalAddress: d.physicalAddress, town: d.town ?? null, county: d.county ?? null,
        maritalStatus: d.maritalStatus ?? null, occupation: d.occupation ?? null,
        employerName: d.employerName ?? null, monthlyIncomeCents: d.monthlyIncomeCents,
        status: 'ACTIVE', kycVerified: false, joinedAt: new Date(),
        createdById: session.user.id,
      },
    });
    for (const k of d.nextOfKins) {
      await tx.nextOfKin.create({ data: { memberProfileId: profile.id, name: k.name, relationship: k.relationship, phone: k.phone, email: k.email ?? null, idNumber: k.idNumber ?? null, percentage: k.percentage ?? null } });
    }
    await tx.memberSharePosition.create({ data: { memberProfileId: profile.id } });
    const main = await tx.savingsProduct.findFirst({ where: { isDefault: true } });
    if (main) {
      const accountNumber = await nextSequence(tx, 'savings');
      await tx.savingsAccount.create({ data: { accountNumber, memberProfileId: profile.id, productId: main.id, createdById: session.user.id } });
    }
    return { profileId: profile.id, memberNumber, accountCreated: Boolean(main) };
  });

  await audit({ userId: session.user.id, userRole: session.user.role, action: 'MEMBER_CREATE', module: 'members', entity: 'MemberProfile', entityId: result.profileId, after: { memberNumber: result.memberNumber }, severity: 'critical' });
  const member = await db.memberProfile.findUnique({ where: { id: result.profileId }, include: { savingsAccounts: true } });
  await notifyPerson(
    { name: d.firstName, email: d.email ?? null, phone: d.phone },
    'member_welcome',
    { name: d.firstName, memberNumber: result.memberNumber, tempPassword, email: d.email ?? '' },
  ).catch(() => null);
  if (member?.userId) {
    await inAppNotify(member.userId, 'Welcome to Divine Sacco', `Member number ${result.memberNumber}. Explore your dashboard and install the member app.`, 'INFO', '/dashboard');
  }
  return ok({ ...result, tempPassword: d.createPortalAccount && d.email ? tempPassword : null });
});
