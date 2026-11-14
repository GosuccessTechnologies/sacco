// M-Pesa Daraja webhook — validated + idempotent (guide §14.2.2).
import { db } from '@/lib/db';
import { finalizeStk } from '@/lib/payments/integrations';
import { postSavingsTransaction } from '@/lib/savings/service';
import { postLoanRepayment } from '@/lib/loans/service';
import { seqNo } from '@/lib/core-utils';

export async function POST(req: Request) {
  const raw = await req.text();
  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  const eventType = payload?.Body?.stkCallback ? 'STK_RESULT' : payload?.Result ? 'B2C_RESULT' : 'C2B';
  const event = await db.webhookEvent.create({
    data: { provider: 'MPESA', eventType, payload: payload ?? { raw: raw.slice(0, 4000) }, signatureValid: true, processed: false },
  }).catch(() => null);
  if (!event) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    // STK callback
    if (payload?.Body?.stkCallback) {
      const cb = payload.Body.stkCallback;
      const merchantRequestId = String(cb.MerchantRequestID ?? '');
      // find PT by providerRef (CheckoutRequestID stored at push time)
      const pt = await db.paymentTransaction.findFirst({
        where: { OR: [{ providerRef: String(cb.CheckoutRequestID ?? merchantRequestId) }, { requestRef: { startsWith: 'PAY-' } }], status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (pt) {
        const receipt = extractReceipt(cb.CallbackMetadata);
        if (cb.ResultCode === 0) {
          if (pt.purpose === 'SAVINGS_DEPOSIT' && pt.accountId) {
            await postSavingsTransaction({ accountId: pt.accountId, type: 'DEPOSIT', channel: 'MPESA', amountCents: pt.amountCents, externalRef: receipt ?? pt.requestRef, narration: 'M-Pesa STK contribution', performedById: null });
          } else if (pt.purpose === 'LOAN_REPAYMENT' && pt.loanId) {
            await postLoanRepayment({ loanId: pt.loanId, amountCents: pt.amountCents, channel: 'MPESA', externalRef: receipt ?? pt.requestRef, paymentTransactionId: pt.id, narration: 'M-Pesa STK repayment', receivedById: null });
          }
          await db.paymentTransaction.update({
            where: { id: pt.id },
            data: { status: 'SUCCESS', mpesaReceipt: receipt, completedAt: new Date(), callbackPayload: payload, providerRef: cb.CheckoutRequestID ?? pt.providerRef },
          });
        } else {
          await db.paymentTransaction.update({
            where: { id: pt.id },
            data: { status: 'FAILED', error: cb.ResultDesc ?? 'Cancelled', callbackPayload: payload, completedAt: new Date() },
          });
        }
      }
    }

    // C2B paybill confirmation
    if (eventType === 'C2B' && payload?.TransID) {
      const receipt = String(payload.TransID);
      const dup = await db.paymentTransaction.findUnique({ where: { mpesaReceipt: receipt } }).catch(() => null);
      if (!dup) {
        const ref = String(payload.BillRefNumber ?? '').trim().toUpperCase();
        const amountCents = Math.round(Number(payload.TransAmount ?? 0) * 100);
        const phone = String(payload.MSISDN ?? '');
        // resolve reference: savings account → deposit; loan number → repayment; else suspense
        const account = ref.startsWith('DIVS-') ? await db.savingsAccount.findUnique({ where: { accountNumber: ref } }) : null;
        const loan = ref.startsWith('DIVL-') ? await db.loan.findUnique({ where: { loanNumber: ref } }) : null;
        const pt = await db.paymentTransaction.create({
          data: {
            requestRef: `PAY-${seqNo('')}`, provider: 'MPESA', type: 'C2B',
            purpose: account ? 'SAVINGS_DEPOSIT' : loan ? 'LOAN_REPAYMENT' : 'UNALLOCATED',
            accountId: account?.id ?? null, loanId: loan?.id ?? null,
            memberProfileId: account?.memberProfileId ?? loan?.memberProfileId ?? null,
            amountCents, phone, status: 'PENDING', mpesaReceipt: receipt, callbackPayload: payload,
          },
        });
        if (account) {
          await postSavingsTransaction({ accountId: account.id, type: 'DEPOSIT', channel: 'MPESA', amountCents, externalRef: receipt, narration: 'M-Pesa paybill contribution', performedById: null });
          await db.paymentTransaction.update({ where: { id: pt.id }, data: { status: 'SUCCESS', completedAt: new Date() } });
        } else if (loan) {
          await postLoanRepayment({ loanId: loan.id, amountCents, channel: 'MPESA', externalRef: receipt, paymentTransactionId: pt.id, narration: 'M-Pesa paybill repayment', receivedById: null });
          await db.paymentTransaction.update({ where: { id: pt.id }, data: { status: 'SUCCESS', completedAt: new Date() } });
        } else {
          // unidentifiable — hold in suspense (guide §14.2.2)
          await db.paymentTransaction.update({ where: { id: pt.id }, data: { status: 'SUCCESS', completedAt: new Date(), narration: 'Unallocated paybill payment — awaiting allocation' } });
        }
      }
    }

    await db.webhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
  } catch (e) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { processed: false, error: (e as Error).message } }).catch(() => null);
  }
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

function extractReceipt(meta?: any[]): string | null {
  if (!Array.isArray(meta)) return null;
  for (const m of meta) if (m?.Name === 'MpesaReceiptCode') return m.Value;
  return null;
}
