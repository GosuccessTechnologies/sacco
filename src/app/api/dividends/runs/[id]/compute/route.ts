// Compute dividend entries — guide §11.2.3.
import { withPermission, ok, err } from '@/lib/api';
import { persistDividendEntries } from '@/lib/shares/service';
import { audit } from '@/lib/audit';

export const POST = withPermission('dividends_run', async ({ params, session }) => {
  const { id } = params;
  try {
    const computed = await persistDividendEntries(id);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'DIVIDEND_COMPUTE', module: 'dividends', entity: 'DividendRun', entityId: id, after: { entries: computed.entries.length, pool: computed.pool }, severity: 'info' });
    return ok({ entries: computed.entries.length, totalPoolCents: computed.pool, preview: computed.entries.slice(0, 20) });
  } catch (e) {
    return err((e as Error).message, 400);
  }
});

export const GET = withPermission(null, async ({ params }) => {
  const { id } = params;
  const entries = await (await import('@/lib/db')).db.dividendEntry.findMany({
    where: { runId: id },
    include: { memberProfile: { select: { memberNumber: true, firstName: true, lastName: true } } },
    orderBy: { totalPayoutCents: 'desc' },
  });
  return ok(entries.map((e) => ({
    id: e.id,
    member: `${e.memberProfile.firstName} ${e.memberProfile.lastName} (${e.memberProfile.memberNumber})`,
    sharesHeld: e.sharesHeld, avgSavingsCents: e.avgSavingsCents,
    shareDividendCents: e.shareDividendCents, depositInterestCents: e.depositInterestCents,
    totalPayoutCents: e.totalPayoutCents, payoutChannel: e.payoutChannel, paidAt: e.paidAt,
  })));
});
