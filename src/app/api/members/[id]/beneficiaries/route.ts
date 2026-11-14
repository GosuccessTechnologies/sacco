// Beneficiaries CRUD — allocation must total 100% when present (guide §8.2.4).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  name: z.string().min(3), relationship: z.string().min(2), phone: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(), dateOfBirth: z.coerce.date().optional().nullable(),
  allocationPct: z.coerce.number().int().min(0).max(100),
});

export const GET = withAuth('members_view', async ({ params }) => {
  const { id } = params;
  return ok(await db.beneficiary.findMany({ where: { memberProfileId: id }, orderBy: { createdAt: 'asc' } }));
});

export const POST = withPermission('members_edit', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const existing = await db.beneficiary.findMany({ where: { memberProfileId: id } });
  const total = existing.reduce((s, b) => s + b.allocationPct, 0) + d.allocationPct;
  if (total > 100) return err(`Allocation would total ${total}% — the maximum is 100%`, 400);
  const row = await db.beneficiary.create({ data: { ...d, memberProfileId: id } });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'BENEFICIARY_CREATE', module: 'members', entity: 'Beneficiary', entityId: row.id, after: d });
  return ok({ ...row, totalAllocationPct: total, warning: total !== 100 ? `Allocations currently total ${total}% (should be exactly 100%)` : null });
});
