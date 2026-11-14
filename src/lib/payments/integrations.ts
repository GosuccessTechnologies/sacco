// ============================================================================
// Payment integrations — M-Pesa Daraja + PesaPal. DEVELOPER_GUIDE.md §14.2
// Credentials from IntegrationCredential (encrypted); auto-test on save.
// Demo mode simulates success (badged SIMULATED).
// ============================================================================
import { db } from '@/lib/db';
import { decryptJson, seqNo } from '@/lib/core-utils';

async function cred(provider: 'MPESA_DARAJA' | 'PESAPAL') {
  const row = await db.integrationCredential.findUnique({ where: { provider } });
  if (!row?.config) return null;
  try {
    const cfg = decryptJson<Record<string, string>>(row.config as unknown as string);
    return { cfg, row };
  } catch { return null; }
}

// =============================================================== M-Pesa Daraja
const DARAJA_BASE = {
  SANDBOX: 'https://sandbox.safaricom.co.ke',
  PRODUCTION: 'https://api.safaricom.co.ke',
} as const;

interface DarajaCfg { consumerKey: string; consumerSecret: string; shortcode: string; passkey: string; environment: 'SANDBOX' | 'PRODUCTION'; b2cInitiatorName?: string; callbackUrl?: string; b2cResultUrl?: string; b2cQueueTimeoutUrl?: string }

async function darajaCfg() {
  const got = await cred('MPESA_DARAJA');
  if (!got) throw new Error('M-Pesa Daraja credentials not configured');
  const cfg = got.cfg as unknown as DarajaCfg;
  return { cfg, demoMode: got.row.demoMode };
}

export async function darajaTest() {
  try {
    const { cfg, demoMode } = await darajaCfg();
    if (demoMode) return { ok: true, demo: true, message: 'Demo mode active — simulated responses' };
    const base = DARAJA_BASE[cfg.environment ?? 'SANDBOX'];
    const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
    const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return { ok: false, message: `OAuth failed (HTTP ${res.status})` };
    const json = await res.json() as any;
    return { ok: Boolean(json.access_token), demo: false, message: json.access_token ? 'Connected — OAuth token issued' : 'No token in response' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

async function darajaToken(base: string, cfg: DarajaCfg): Promise<string> {
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`Daraja OAuth failed: HTTP ${res.status}`);
  const json = await res.json() as any;
  if (!json.access_token) throw new Error('Daraja OAuth returned no token');
  return json.access_token;
}

const timestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
const password = (cfg: DarajaCfg) => Buffer.from(`${cfg.shortcode}${cfg.passkey}${timestamp()}`).toString('base64');

/** STK push — returns { requestRef } and creates PaymentTransaction rows. */
export async function stkPush(opts: {
  phone: string; amountCents: number; accountReference: string;
  purpose: string; memberId?: string | null; accountId?: string | null; loanId?: string | null;
  description?: string;
}): Promise<{ requestRef: string; paymentTransactionId: string; simulated: boolean; checkoutRequestId?: string; customerMessage: string }> {
  const { cfg, demoMode } = await darajaCfg();
  const requestRef = `PAY-${seqNo('')}`;
  const amount = Math.max(1, Math.ceil(opts.amountCents / 100));
  const pt = await db.paymentTransaction.create({
    data: {
      requestRef, provider: 'MPESA', type: 'STK_PUSH', purpose: opts.purpose,
      memberProfileId: opts.memberId ?? null, accountId: opts.accountId ?? null, loanId: opts.loanId ?? null,
      amountCents: opts.amountCents, phone: opts.phone, status: 'PENDING',
      statusHistory: [{ at: new Date().toISOString(), status: 'INITIATED' }, { at: new Date().toISOString(), status: 'PENDING' }],
      narration: opts.description ?? `STK ${opts.purpose}`,
    },
  });

  if (demoMode) {
    // simulated success after short delay
    setTimeout(() => finalizeStk(requestRef, {
      ResultCode: 0, ResultDesc: 'Accepted', CheckoutRequestID: `sim-${requestRef}`,
      simulated: true,
    }), 2500).unref?.();
    return { requestRef, paymentTransactionId: pt.id, simulated: true, customerMessage: 'Demo mode: an STK confirmation will be simulated shortly' };
  }

  const base = DARAJA_BASE[cfg.environment ?? 'SANDBOX'];
  const token = await darajaToken(base, cfg);
  const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password(cfg),
      Timestamp: timestamp(),
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: opts.phone,
      PartyB: cfg.shortcode,
      PhoneNumber: opts.phone,
      CallBackURL: cfg.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://example.com'}/api/webhooks/mpesa`,
      AccountReference: opts.accountReference.slice(0, 12),
      TransactionDesc: (opts.description ?? 'Payment').slice(0, 20),
    }),
  });
  const json = await res.json() as any;
  if (!res.ok || json.ResponseCode !== '0') {
    await markPayment(pt.id, 'FAILED', json.errorMessage ?? `STK failed HTTP ${res.status}`);
    throw new Error(json.errorMessage ?? 'STK push failed');
  }
  await db.paymentTransaction.update({
    where: { id: pt.id },
    data: { providerRef: json.CheckoutRequestID, statusHistory: { push: json } as any },
  });
  return { requestRef, paymentTransactionId: pt.id, simulated: false, checkoutRequestId: json.CheckoutRequestID, customerMessage: json.CustomerMessage ?? 'Check your phone' };
}

/** Process an STK callback result (from webhook or demo). */
export async function finalizeStk(requestRef: string, result: { ResultCode: number; ResultDesc?: string; CheckoutRequestID?: string; simulated?: boolean; CallbackMetadata?: any[] }): Promise<void> {
  const pt = await db.paymentTransaction.findUnique({ where: { requestRef } });
  if (!pt || pt.status === 'SUCCESS' || pt.status === 'FAILED') return; // idempotent
  const receipt = extractReceipt(result.CallbackMetadata);
  if (result.ResultCode === 0) {
    await markPayment(pt.id, 'SUCCESS', null, receipt, result.simulated ? 'SIMULATED' : null);
    await applySuccessfulPayment(pt);
  } else {
    await markPayment(pt.id, 'FAILED', result.ResultDesc ?? 'Cancelled by user', receipt);
  }
}

function extractReceipt(meta?: any[]): string | null {
  if (!Array.isArray(meta)) return null;
  for (const m of meta) if (m?.Name === 'MpesaReceiptCode') return m.Value;
  return null;
}

async function markPayment(id: string, status: string, error?: string | null, receipt?: string | null, badge?: string | null) {
  const pt = await db.paymentTransaction.findUnique({ where: { id } });
  if (!pt) return;
  await db.paymentTransaction.update({
    where: { id },
    data: {
      status,
      error: error ?? undefined,
      mpesaReceipt: receipt ?? pt.mpesaReceipt,
      completedAt: status === 'SUCCESS' || status === 'FAILED' ? new Date() : null,
      statusHistory: [...((pt.statusHistory as any[]) ?? []), { at: new Date().toISOString(), status, error, badge }] as any,
      narration: pt.narration ? `${pt.narration}${badge ? ` [${badge}]` : ''}` : (badge ?? undefined),
    },
  });
}

/** Route a successful payment into its module flow. Guide §14.8. */
async function applySuccessfulPayment(pt: { id: string; purpose: string; accountId: string | null; loanId: string | null; memberProfileId: string | null; amountCents: number; requestRef: string; mpesaReceipt: string | null }) {
  try {
    if (pt.purpose === 'SAVINGS_DEPOSIT' && pt.accountId) {
      const { postSavingsTransaction } = await import('@/lib/savings/service');
      await postSavingsTransaction({
        accountId: pt.accountId, type: 'DEPOSIT', channel: 'MPESA', amountCents: pt.amountCents,
        narration: 'M-Pesa contribution', externalRef: pt.mpesaReceipt ?? pt.requestRef,
      });
    } else if (pt.purpose === 'LOAN_REPAYMENT' && pt.loanId) {
      const { postLoanRepayment } = await import('@/lib/loans/service');
      await postLoanRepayment({
        loanId: pt.loanId, amountCents: pt.amountCents, channel: 'MPESA',
        externalRef: pt.mpesaReceipt ?? pt.requestRef, paymentTransactionId: pt.id,
        narration: 'M-Pesa loan repayment',
      });
    }
    await db.paymentTransaction.update({ where: { id: pt.id }, data: { accountId: pt.accountId ?? null } });
  } catch (e) {
    console.error('[payments] apply failed — marking SUCCESS_UNPOSTED', (e as Error).message);
    await db.paymentTransaction.update({ where: { id: pt.id }, data: { status: 'SUCCESS_UNPOSTED', error: (e as Error).message } });
  }
}

/** B2C disbursement request (async finalization via result webhook). */
export async function b2cDisburse(opts: {
  phone: string; amountCents: number; purpose: string; memberId?: string | null; loanId?: string | null;
  narration?: string;
}): Promise<{ requestRef: string; paymentTransactionId: string; simulated: boolean; conversationId?: string }> {
  const { cfg, demoMode } = await darajaCfg();
  const requestRef = `PAY-${seqNo('')}`;
  const pt = await db.paymentTransaction.create({
    data: {
      requestRef, provider: 'MPESA', type: 'B2C', purpose: opts.purpose,
      memberProfileId: opts.memberId ?? null, loanId: opts.loanId ?? null,
      amountCents: opts.amountCents, phone: opts.phone, status: 'PENDING',
      narration: opts.narration ?? `B2C ${opts.purpose}`,
      statusHistory: [{ at: new Date().toISOString(), status: 'PENDING' }] as any,
    },
  });
  if (demoMode) {
    setTimeout(async () => {
      await markPayment(pt.id, 'SUCCESS', null, `sim-${requestRef}`, 'SIMULATED');
    }, 2500).unref?.();
    return { requestRef, paymentTransactionId: pt.id, simulated: true, conversationId: `sim-${requestRef}` };
  }
  const base = DARAJA_BASE[cfg.environment ?? 'SANDBOX'];
  const token = await darajaToken(base, cfg);
  const res = await fetch(`${base}/mpesa/b2c/v1/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      InitiatorName: cfg.b2cInitiatorName ?? 'testapi',
      SecurityCredential: 'ENCRYPTED-CREDENTIAL', // production: public-key encrypt per docs
      CommandID: 'BusinessPayment',
      Amount: Math.ceil(opts.amountCents / 100),
      PartyA: cfg.shortcode,
      PartyB: opts.phone,
      Remarks: opts.narration ?? 'Disbursement',
      QueueTimeOutURL: cfg.b2cQueueTimeoutUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/mpesa`,
      ResultURL: cfg.b2cResultUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/mpesa`,
      Occasion: opts.purpose,
    }),
  });
  const json = await res.json() as any;
  if (!res.ok || !json.ConversationID) {
    await markPayment(pt.id, 'FAILED', json.errorMessage ?? `B2C failed HTTP ${res.status}`);
    throw new Error(json.errorMessage ?? 'B2C request failed');
  }
  await db.paymentTransaction.update({ where: { id: pt.id }, data: { providerRef: json.ConversationID } });
  return { requestRef, paymentTransactionId: pt.id, simulated: false, conversationId: json.ConversationID };
}

// =============================================================== PesaPal
interface PesaPalCfg { consumerKey: string; consumerSecret: string; environment: 'SANDBOX' | 'PRODUCTION'; ipnUrl?: string; callbackUrl?: string }
const PESAPAL_BASE = { SANDBOX: 'https://cyberrazor-sandbox.pesapal.com', PRODUCTION: 'https://pay.pesapal.com' } as const;

async function pesapalCfg() {
  const got = await cred('PESAPAL');
  if (!got) throw new Error('PesaPal credentials not configured');
  return { cfg: got.cfg as unknown as PesaPalCfg, demoMode: got.row.demoMode };
}

export async function pesapalTest() {
  try {
    const { cfg, demoMode } = await pesapalCfg();
    if (demoMode) return { ok: true, demo: true, message: 'Demo mode active' };
    const res = await fetch(`${PESAPAL_BASE[cfg.environment ?? 'SANDBOX']}/api/auth/request-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ consumer_key: cfg.consumerKey, consumer_secret: cfg.consumerSecret }),
    });
    const json = await res.json() as any;
    return { ok: Boolean(json?.token), demo: false, message: json?.token ? 'Connected — token issued' : (json?.error?.message ?? 'No token') };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function pesapalRegisterIpn() {
  const { cfg } = await pesapalCfg();
  const tokenRes = await fetch(`${PESAPAL_BASE[cfg.environment ?? 'SANDBOX']}/api/auth/request-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consumer_key: cfg.consumerKey, consumer_secret: cfg.consumerSecret }),
  });
  const tokenJson = await tokenRes.json() as any;
  const res = await fetch(`${PESAPAL_BASE[cfg.environment ?? 'SANDBOX']}/api/urlsetup`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokenJson.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ url: cfg.ipnUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/pesapal` }),
  });
  return res.ok;
}
