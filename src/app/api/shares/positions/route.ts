// Share positions — guide §11.4.
import { withAuth, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const GET = withAuth(null, async () => {
  const [rows, sharesCfg] = await Promise.all([
    db.memberSharePosition.findMany({
      include: { memberProfile: { select: { memberNumber: true, firstName: true, lastName: true, status: true } } },
      orderBy: { totalShares: 'desc' },
    }),
    getSettings('shares'),
  ]);
  return ok(rows.map((p) => ({
    id: p.id,
    member: `${p.memberProfile.firstName} ${p.memberProfile.lastName} (${p.memberProfile.memberNumber})`,
    memberId: p.memberProfileId, memberStatus: p.memberProfile.status,
    totalShares: p.totalShares, totalValueCents: p.totalValueCents,
    lastDividendAt: p.lastDividendAt,
    meetsMinimum: p.totalShares >= sharesCfg.minSharesForMembership,
  })));
});
