// Member detail / update — guide §8.4.
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const patchSchema = z.object({
  firstName: z.string().min(2).optional(), middleName: z.string().nullable().optional(), lastName: z.string().min(2).optional(),
  phone: z.string().regex(/^\+?[0-9\s-]{9,15}$/).optional(), altPhone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(), physicalAddress: z.string().min(4).optional(),
  town: z.string().nullable().optional(), county: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(), employerName: z.string().nullable().optional(),
  monthlyIncomeCents: z.coerce.number().int().min(0).optional(), kraPin: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = withAuth('members_view', async ({ params, session }) => {
  const { id } = params;
  const canPii = session.user.role === 'SUPER_ADMIN' || session.user.permissions.includes('members_view_pii');
  const m = await db.memberProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, status: true, lastLoginAt: true, mustChangePassword: true } },
      nextOfKins: true, beneficiaries: true, sharePosition: true,
      savingsAccounts: { include: { product: true, _count: { select: { transactions: true } } } },
      loanApplications: { orderBy: { appliedAt: 'desc' }, take: 10, include: { product: true } },
      loans: { orderBy: { disbursedAt: 'desc' }, include: { product: true, _count: { select: { repayments: true } } } },
      guarantorships: { include: { application: { include: { memberProfile: true } } } },
      shareTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      standingOrders: true,
    },
  });
  if (!m) return err('Member not found', 404);
  if (!canPii) {
    m.nationalId = '•••••' + m.nationalId.slice(-3);
    m.phone = '•••••' + m.phone.slice(-3);
    m.email = m.email ? '•••@•••' : m.email;
    m.kraPin = m.kraPin ? '••••' : m.kraPin;
  }
  return ok(m);
});

export const PATCH = withPermission('members_edit', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, patchSchema);
  const before = await db.memberProfile.findUnique({ where: { id } });
  if (!before) return err('Member not found', 404);
  const after = await db.memberProfile.update({ where: { id }, data: d });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'MEMBER_UPDATE', module: 'members', entity: 'MemberProfile', entityId: id, before, after, severity: 'info' });
  return ok({ updated: true });
});
