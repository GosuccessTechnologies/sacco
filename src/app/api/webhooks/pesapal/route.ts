// PesaPal IPN — order status completion (guide §14.2.3).
import { db } from '@/lib/db';
import { seqNo } from '@/lib/core-utils';
import { postSavingsTransaction } from '@/lib/savings/service';

export async function GET(req: Request) {
  // PesaPal IPN confirmation: order_tracking_id, order_merchant_reference, status
  const url = new URL(req.url);
  const orderTrackingId = url.searchParams.get('order_tracking_id');
  const merchantRef = url.searchParams.get('order_merchant_reference') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const event = await db.webhookEvent.create({
    data: { provider: 'PESAPAL', eventType: 'IPN', payload: { orderTrackingId, merchantRef, status }, signatureValid: true, processed: false },
  }).catch(() => null);
  if (!event) return Response.json({ ok: true });

  try {
    if (orderTrackingId && (status === 'COMPLETE' || status === 'COMPLETED')) {
      const existing = await db.paymentTransaction.findFirst({ where: { providerRef: orderTrackingId } });
      if (!existing) {
        // merchantRef format: PURPOSE|accountId|amountCents
        const [purpose, accountId, amountStr] = merchantRef.split('|');
        const amountCents = Number(amountStr ?? 0);
        if (purpose === 'SAVINGS_DEPOSIT' && accountId && amountCents > 0) {
          const pt = await db.paymentTransaction.create({
            data: { requestRef: `PAY-${seqNo('')}`, provider: 'PESAPAL', type: 'PESAPAL_ORDER', purpose, accountId, amountCents, status: 'SUCCESS', providerRef: orderTrackingId, completedAt: new Date() },
          });
          await postSavingsTransaction({ accountId, type: 'DEPOSIT', channel: 'BANK', amountCents, externalRef: orderTrackingId, narration: 'PesaPal card/wallet payment', performedById: null });
          void pt;
        }
      }
    }
    await db.webhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
  } catch (e) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: (e as Error).message } }).catch(() => null);
  }
  return Response.json({ ok: true });
}

export const POST = GET;
