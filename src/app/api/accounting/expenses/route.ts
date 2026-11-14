// Vendors + expenses/bills lifecycle (guide §13.2.4).
import { withAuth, withPermission, ok, err, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { postJournal } from '@/lib/accounting/posting';

export const GET = withAuth(null, async ({ req }) => {
  const q = query(req);
  const rows = await db.expense.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ description: { contains: q.search } }, { vendor: { name: { contains: q.search } } }] } : {}),
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { billDate: 'desc' },
    take: 400,
  });
  // Expense has no glAccount relation — resolve the GL label from glAccountId
  const glIds = [...new Set(rows.map((e) => e.glAccountId))];
  const glAccounts = await db.glAccount.findMany({ where: { id: { in: glIds } }, select: { id: true, code: true, name: true } });
  const glById = new Map(glAccounts.map((g) => [g.id, g]));
  return ok(rows.map((e) => {
    const gl = glById.get(e.glAccountId);
    return {
      id: e.id, description: e.description, vendor: e.vendor?.name ?? '—',
      category: gl ? `${gl.code} ${gl.name}` : '—',
      amountCents: e.amountCents, billDate: e.billDate, dueDate: e.dueDate, status: e.status,
      paidVia: e.paidVia ?? '', paymentRef: e.paymentRef ?? '',
    };
  }));
});

const schema = z.object({
  description: z.string().min(3), amountCents: z.coerce.number().int().positive(),
  glAccountCode: z.string(), vendorId: z.string().optional().nullable(),
  billDate: z.coerce.date().default(() => new Date()), dueDate: z.coerce.date().optional().nullable(),
});

export const POST = withPermission('accounting_expenses', async ({ req, session }) => {
  const d = await body(req, schema);
  const gl = await getSettings('glMap');
  const glAccount = await db.glAccount.findUnique({ where: { code: d.glAccountCode } });
  if (!glAccount) return err('GL account not found', 404);
  const row = await db.expense.create({
    data: {
      description: d.description, amountCents: d.amountCents, glAccountId: glAccount.id,
      vendorId: d.vendorId ?? null, billDate: d.billDate, dueDate: d.dueDate ?? null, status: 'DRAFT',
      createdById: session.user.id,
    },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'EXPENSE_CREATE', module: 'accounting', entity: 'Expense', entityId: row.id, after: d, severity: 'info' });
  return ok(row);
});
