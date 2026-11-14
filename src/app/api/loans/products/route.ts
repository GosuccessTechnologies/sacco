// Loan products — guide §10.4.
import { withAuth, withPermission, ok, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  code: z.string().min(2).max(20), name: z.string().min(3), description: z.string().optional(),
  interestMethod: z.enum(['REDUCING', 'FLAT']), interestRateBps: z.coerce.number().int().min(0).max(10000),
  penaltyPerDayBps: z.coerce.number().int().min(0).max(1000).default(50),
  termMinMonths: z.coerce.number().int().min(1).max(120), termMaxMonths: z.coerce.number().int().min(1).max(120),
  minAmountCents: z.coerce.number().int().min(0), maxAmountCents: z.coerce.number().int().min(0),
  savingsMultiplier: z.coerce.number().int().min(1).max(10),
  processingFeeBps: z.coerce.number().int().min(0).max(5000).default(200),
  insuranceFeeBps: z.coerce.number().int().min(0).max(5000).default(100),
  requiredGuarantors: z.coerce.number().int().min(0).max(10),
  guaranteeCoveragePct: z.coerce.number().int().min(1).max(100).default(20),
  gracePeriodDays: z.coerce.number().int().min(0).max(90).default(0),
  allowTopUp: z.boolean().default(false),
  securityOptions: z.array(z.string()).optional(),
  isPublic: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const GET = withAuth(null, async () => ok(await db.loanProduct.findMany({ orderBy: { sortOrder: 'asc' } })));

export const POST = withPermission('loans_products', async ({ req, session }) => {
  const d = await body(req, schema);
  if (d.termMinMonths > d.termMaxMonths) return ok({ error: 'termMin > termMax' }) as never as Response;
  const row = await db.loanProduct.create({ data: d });
  revalidatePath('/');
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_PRODUCT_CREATE', module: 'loans', entity: 'LoanProduct', entityId: row.id, after: d });
  return ok(row);
});

export const PATCH = withPermission('loans_products', async ({ req, session }) => {
  const d = await body(req, schema.partial().extend({ id: z.string() }));
  const { id, ...rest } = d;
  const row = await db.loanProduct.update({ where: { id }, data: rest });
  revalidatePath('/');
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'LOAN_PRODUCT_UPDATE', module: 'loans', entity: 'LoanProduct', entityId: id, after: rest });
  return ok(row);
});
