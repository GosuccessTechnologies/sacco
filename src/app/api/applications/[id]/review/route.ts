// Applications review — approve triggers atomic provisioning (guide §8.2.1).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { nextSequence } from '@/lib/core-utils';
import { hashPassword } from '@/lib/password';
import { notifyPerson } from '@/lib/notify';
import { randomBytes } from 'node:crypto';

const schema = z.object({ decision: z.enum(['approve', 'reject', 'under_review']), reason: z.string().optional() });

export const POST = withPermission('members_create', async ({ req, params, session }) => {
  const { id } = params;
  const { decision, reason } = await body(req, schema);
  const app = await db.membershipApplication.findUnique({ where: { id } });
  if (!app) return err('Application not found', 404);
  if (app.status === 'APPROVED' || app.status === 'REJECTED') return err('Application already decided', 409);

  if (decision === 'reject') {
    await db.membershipApplication.update({ where: { id }, data: { status: 'REJECTED', reviewNotes: reason ?? null, reviewedById: session.user.id, reviewedAt: new Date() } });
    await notifyPerson({ name: app.firstName, email: app.email, phone: app.phone }, 'application_rejected', { name: app.firstName, applicationNumber: app.applicationNumber, reason: reason ?? 'Not stated' }).catch(() => null);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'APPLICATION_REJECT', module: 'members', entity: 'MembershipApplication', entityId: id, after: { reason }, severity: 'warn' });
    return ok({ status: 'REJECTED' });
  }

  if (decision === 'under_review') {
    await db.membershipApplication.update({ where: { id }, data: { status: 'UNDER_REVIEW', reviewedById: session.user.id } });
    return ok({ status: 'UNDER_REVIEW' });
  }

  // ---------------- APPROVE: atomic provisioning (guide §8.2.1)
  const tempPassword = `Divine@${randomBytes(3).toString('hex')}`;
  const kins = (app.nextOfKins as any[]) ?? [];
  const provisioned = await db.$transaction(async (tx) => {
    const dup = await tx.memberProfile.findFirst({ where: { nationalId: app.nationalId } });
    if (dup) throw new Error('ID already registered as a member');
    const memberNumber = await nextSequence(tx, 'member');
    let userId: string | null = null;
    if (app.email) {
      const exists = await tx.user.findUnique({ where: { email: app.email } });
      if (!exists) {
        const u = await tx.user.create({
          data: { email: app.email, phone: app.phone, name: `${app.firstName} ${app.lastName}`, role: 'MEMBER', passwordHash: hashPassword(tempPassword), status: 'ACTIVE', mustChangePassword: true },
        });
        userId = u.id;
      }
    }
    const profile = await tx.memberProfile.create({
      data: {
        userId, memberNumber,
        firstName: app.firstName, middleName: app.middleName, lastName: app.lastName,
        gender: app.gender, dateOfBirth: app.dateOfBirth, nationalId: app.nationalId,
        passportNo: app.passportNo, kraPin: app.kraPin,
        phone: app.phone, altPhone: null, email: app.email,
        physicalAddress: app.physicalAddress, town: app.town, county: app.county,
        occupation: app.occupation, employerName: app.employerName,
        monthlyIncomeCents: app.monthlyIncomeCents,
        status: 'ACTIVE', joinedAt: new Date(), createdById: session.user.id,
      },
    });
    for (const k of kins) {
      await tx.nextOfKin.create({
        data: { memberProfileId: profile.id, name: k.name, relationship: k.relationship, phone: k.phone, email: k.email ?? null, idNumber: k.idNumber ?? null, percentage: k.percentage ?? null },
      });
    }
    await tx.memberSharePosition.create({ data: { memberProfileId: profile.id } });
    const main = await tx.savingsProduct.findFirst({ where: { isDefault: true } });
    let accountNumber: string | null = null;
    if (main) {
      accountNumber = await nextSequence(tx, 'savings');
      await tx.savingsAccount.create({ data: { accountNumber, memberProfileId: profile.id, productId: main.id, createdById: session.user.id } });
    }
    await tx.membershipApplication.update({ where: { id }, data: { status: 'APPROVED', reviewNotes: reason ?? null, reviewedById: session.user.id, reviewedAt: new Date() } });
    return { memberNumber, userId, accountNumber };
  });

  await notifyPerson(
    { name: app.firstName, email: app.email, phone: app.phone },
    'application_approved',
    { name: app.firstName, memberNumber: provisioned.memberNumber, tempPassword, email: app.email ?? '' },
  ).catch(() => null);
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'APPLICATION_APPROVE', module: 'members', entity: 'MembershipApplication', entityId: id, after: provisioned, severity: 'critical' });
  return ok({ status: 'APPROVED', ...provisioned, tempPassword: app.email ? tempPassword : null });
});
