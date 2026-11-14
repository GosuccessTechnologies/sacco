// Savings products — guide §9.4.
import { withAuth, withPermission, ok, body, err } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  code: z.string().min(2).max(20), name: z.string().min(3), description: z.string().optional(),
  type: z.enum(['REGULAR', 'FIXED', 'HOLIDAY', 'CHRISTMAS', 'JUNIOR', 'TARGET']),
  interestRateBps: z.coerce.number().int().min(0).max(5000).default(0),
  minBalanceCents: z.coerce.number().int().min(0).default(0),
  minOpeningCents: z.coerce.number().int().min(0).default(0),
  monthlyFeeCents: z.coerce.number().int().min(0).default(0),
  withdrawalPolicy: z.enum(['FREE', 'LOCKED_UNTIL_MATURITY', 'PENALTY', 'APPROVAL_REQUIRED']).default('FREE'),
  withdrawalPenaltyBps: z.coerce.number().int().min(0).max(5000).default(0),
  lockInMonths: z.coerce.number().int().min(0).max(120).default(0),
  ageMaxForJunior: z.coerce.number().int().optional().nullable(),
  maturityTermsMonths: z.coerce.number().int().optional().nullable(),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
});

export const GET = withAuth(null, async () => {
  return ok(await db.savingsProduct.findMany({ orderBy: { sortOrder: 'asc' } }));
});

export const POST = withPermission('savings_products', async ({ req, session }) => {
  const d = await body(req, schema);
  if (d.isDefault) await db.savingsProduct.updateMany({ data: { isDefault: false } });
  const row = await db.savingsProduct.create({ data: d });
  revalidatePath('/');
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'SAVINGS_PRODUCT_CREATE', module: 'savings', entity: 'SavingsProduct', entityId: row.id, after: d, severity: 'info' });
  return ok(row);
});

export const PATCH = withPermission('savings_products', async ({ req, session }) => {
  const d = await body(req, schema.partial().extend({ id: z.string() }));
  const { id, ...rest } = d;
  if (rest.isDefault) await db.savingsProduct.updateMany({ data: { isDefault: false } });
  const row = await db.savingsProduct.update({ where: { id }, data: rest });
  revalidatePath('/');
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'SAVINGS_PRODUCT_UPDATE', module: 'savings', entity: 'SavingsProduct', entityId: id, after: rest, severity: 'info' });
  return ok(row);
});
