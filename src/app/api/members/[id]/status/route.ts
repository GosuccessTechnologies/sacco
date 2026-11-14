// Member status transitions + KYC verify — guide §8.2.2/§8.2.3.
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notifyPerson } from '@/lib/notify';

const schema = z.object({
  action: z.enum(['suspend', 'blacklist', 'reactivate', 'exit', 'kyc_verify', 'toggle_portal']),
  reason: z.string().optional(),
});

export const POST = withPermission(null, async ({ req, params, session }) => {
  const { id } = params;
  const { action, reason } = await body(req, schema);
  const needed =
    action === 'kyc_verify' ? 'members_kyc_verify' :
    action === 'toggle_portal' ? 'users_manage' : 'members_status';
  if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes(needed)) {
    return err('You do not have permission for this action', 403);
  }
  const m = await db.memberProfile.findUnique({ where: { id }, include: { user: true, savingsAccounts: true, loans: true } });
  if (!m) return err('Member not found', 404);

  switch (action) {
    case 'suspend':
      await db.memberProfile.update({ where: { id }, data: { status: 'SUSPENDED', blacklistReason: null } });
      if (m.user) await db.user.update({ where: { id: m.user.id }, data: { status: 'SUSPENDED' } });
      await notifyPerson({ name: m.firstName, email: m.email, phone: m.phone }, 'account_suspended', { name: m.firstName, status: 'suspended' }).catch(() => null);
      break;
    case 'blacklist':
      await db.memberProfile.update({ where: { id }, data: { status: 'BLACKLISTED', blacklistReason: reason ?? 'Policy' } });
      break;
    case 'reactivate':
      await db.memberProfile.update({ where: { id }, data: { status: 'ACTIVE', blacklistReason: null, exitAt: null, exitReason: null } });
      if (m.user) await db.user.update({ where: { id: m.user.id }, data: { status: 'ACTIVE' } });
      break;
    case 'exit': {
      const totalBalance = m.savingsAccounts.reduce((s, a) => s + a.balanceCents, 0);
      const openLoans = m.loans.filter((l) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status));
      if (totalBalance !== 0 || openLoans.length) {
        return err('Member must have zero balances and no active loans before exit', 400);
      }
      await db.memberProfile.update({ where: { id }, data: { status: 'EXITED', exitAt: new Date(), exitReason: reason ?? 'Voluntary' } });
      if (m.user) await db.user.update({ where: { id: m.user.id }, data: { status: 'DISABLED' } });
      break;
    }
    case 'kyc_verify':
      await db.memberProfile.update({ where: { id }, data: { kycVerified: true, kycVerifiedAt: new Date(), verifiedById: session.user.id } });
      break;
    case 'toggle_portal': {
      if (!m.user) return err('Member has no portal account', 400);
      const nextStatus = m.user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await db.user.update({ where: { id: m.user.id }, data: { status: nextStatus } });
      await audit({ userId: session.user.id, userRole: session.user.role, action: 'MEMBER_PORTAL_TOGGLE', module: 'members', entity: 'User', entityId: m.user.id, after: { status: nextStatus }, severity: 'warn' });
      return ok({ portalStatus: nextStatus });
    }
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: `MEMBER_${action.toUpperCase()}`, module: 'members', entity: 'MemberProfile', entityId: id, before: { status: m.status }, after: { reason }, severity: action === 'exit' ? 'critical' : 'warn' });
  return ok({ done: true });
});
