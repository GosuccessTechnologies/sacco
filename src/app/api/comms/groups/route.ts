// Contact groups — audience resolution (guide §16.2.1).
import { withAuth, withPermission, ok, body, query } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';

export const GET = withAuth(null, async () => {
  const groups = await db.contactGroup.findMany({ orderBy: { createdAt: 'desc' } });
  const out = [];
  for (const g of groups) {
    const count = await resolveGroupSize(g.source);
    out.push({ id: g.id, name: g.name, source: g.source, description: g.description ?? '', audience: count });
  }
  return ok(out);
});

async function resolveGroupSize(source: string): Promise<number> {
  switch (source) {
    case 'SUBSCRIBERS': return db.subscriber.count({ where: { status: 'ACTIVE' } });
    case 'ACTIVE_MEMBERS': return db.memberProfile.count({ where: { status: 'ACTIVE' } });
    case 'MEMBERS_WITH_SAVINGS': return db.memberProfile.count({ where: { status: 'ACTIVE', savingsAccounts: { some: { status: 'OPEN' } } } });
    case 'SHAREHOLDERS': return db.memberSharePosition.count({ where: { totalShares: { gt: 0 } } });
    case 'LOAN_DUE': {
      const today = new Date();
      const loans = await db.loan.findMany({ where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } }, include: { schedule: true } });
      return loans.filter((l) => l.schedule.some((s) => s.dueDate >= today && s.dueDate <= new Date(today.getTime() + 7 * 86400000) && s.paidCents < s.totalDueCents)).length;
    }
    default: return 0;
  }
}

export const POST = withPermission('comms_groups', async ({ req, session }) => {
  const d = await body(req, z.object({
    name: z.string().min(3),
    source: z.enum(['SUBSCRIBERS', 'ACTIVE_MEMBERS', 'LOAN_DUE', 'MEMBERS_WITH_SAVINGS', 'SHAREHOLDERS', 'CUSTOM_CSV']),
    description: z.string().optional(),
    csvContacts: z.array(z.object({ name: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional() })).optional(),
  }));
  if (d.source === 'CUSTOM_CSV' && !d.csvContacts?.length) {
    return err('Import at least one contact for a custom group', 422);
  }
  const row = await db.contactGroup.create({
    data: {
      name: d.name, source: d.source, description: d.description ?? null,
      materializedContacts: d.source === 'CUSTOM_CSV' ? (d.csvContacts as any) : undefined,
      createdById: session.user.id,
    },
  });
  return ok({ id: row.id, audience: await resolveGroupSize(d.source) });
});
