// Member shares + dividend history — guide §11.6 (portal).
import { withAuth, ok, err } from '@/lib/api';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { purchaseShares } from '@/lib/shares/service';

export const GET = withAuth(null, async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const [position, transactions, entries, sharesCfg] = await Promise.all([
    db.memberSharePosition.findUnique({ where: { memberProfileId: memberId } }),
    db.shareTransaction.findMany({ where: { memberProfileId: memberId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.dividendEntry.findMany({ where: { memberProfileId: memberId }, include: { run: { select: { year: true, status: true } } }, orderBy: { createdAt: 'desc' } }),
    getSettings('shares'),
  ]);
  return ok({
    position: { totalShares: position?.totalShares ?? 0, totalValueCents: position?.totalValueCents ?? 0, lastDividendAt: position?.lastDividendAt ?? null },
    config: { nominalValueCents: sharesCfg.nominalValueCents, minShares: sharesCfg.minSharesForMembership },
    transactions: transactions.map((t) => ({
      id: t.id, certificateRef: t.certificateRef ?? '', type: t.type, quantity: t.quantity,
      amountCents: t.amountCents, channel: t.channel, narration: t.narration ?? '', createdAt: t.createdAt,
    })),
    dividends: entries.map((e) => ({
      id: e.id, year: e.run.year, runStatus: e.run.status,
      sharesHeld: e.sharesHeld, shareDividendCents: e.shareDividendCents,
      depositInterestCents: e.depositInterestCents, totalPayoutCents: e.totalPayoutCents,
      payoutChannel: e.payoutChannel, paidAt: e.paidAt,
    })),
  });
});

export const POST = withAuth('shares_post', async ({ req, session }) => {
  const url = new URL(req.url);
  const memberId = session.user.role === 'MEMBER' ? session.user.memberId : url.searchParams.get('memberId');
  if (!memberId) return err('memberId required', 422);
  const { quantity, savingsAccountId } = await req.json().catch(() => ({})) as { quantity?: number; savingsAccountId?: string };
  if (!quantity || quantity < 1) return err('Quantity required', 422);
  try {
    const result = await purchaseShares({
      memberProfileId: memberId, quantity,
      channel: savingsAccountId ? 'SAVINGS' : 'PORTAL',
      savingsAccountId, performedById: session.user.id,
      narration: 'Portal share purchase',
    });
    return ok(result);
  } catch (e) {
    return err((e as Error).message, 400);
  }
});
