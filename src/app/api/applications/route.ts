// Applications list (admin) — guide §8.4.
import { withAuth, withPermission, ok, query } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth('members_view', async ({ req }) => {
  const q = query(req);
  const rows = await db.membershipApplication.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { applicationNumber: { contains: q.search } }, { nationalId: { contains: q.search } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return ok(rows.map((a) => ({
    id: a.id, applicationNumber: a.applicationNumber, source: a.source,
    name: `${a.firstName} ${a.middleName ?? ''} ${a.lastName}`.replace(/\s+/g, ' '),
    nationalId: a.nationalId, phone: a.phone, email: a.email ?? '',
    county: a.county ?? '—', occupation: a.occupation ?? '—',
    status: a.status, appliedAt: a.createdAt,
    products: ((a.productsInterested as any[]) ?? []).map((p) => `${p.type}:${p.code}`).join(', ') || '—',
    reviewNotes: a.reviewNotes ?? '',
  })));
});
