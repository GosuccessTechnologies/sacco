// Integration credentials — masked view + encrypted save (guide §14.2.1).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encryptJson, decryptJson } from '@/lib/core-utils';
import { audit } from '@/lib/audit';
import { darajaTest, pesapalTest } from '@/lib/payments/integrations';
import { sendEmail } from '@/lib/notify';
import { getBrand } from '@/lib/email-template';
import { brandedEmail } from '@/lib/email-template';

const PROVIDERS = ['MPESA_DARAJA', 'PESAPAL', 'SMTP', 'SMS_GATEWAY', 'SOCIAL'] as const;

function maskValue(v: string | undefined): string {
  if (!v) return '';
  return v.length <= 4 ? '••••' : '••••' + v.slice(-4);
}

export const GET = withAuth('settings_integrations_view', async () => {
  const rows = await db.integrationCredential.findMany();
  const out: Record<string, unknown>[] = [];
  for (const p of PROVIDERS) {
    const row = rows.find((r) => r.provider === p);
    let fields: { key: string; label: string; masked: string; set: boolean }[] = [];
    let cfg: Record<string, string> = {};
    if (row?.config) {
      try { cfg = decryptJson(row.config as unknown as string); } catch { cfg = {}; }
    }
    switch (p) {
      case 'MPESA_DARAJA':
        fields = [
          { key: 'consumerKey', label: 'Consumer Key', masked: maskValue(cfg.consumerKey), set: Boolean(cfg.consumerKey) },
          { key: 'consumerSecret', label: 'Consumer Secret', masked: maskValue(cfg.consumerSecret), set: Boolean(cfg.consumerSecret) },
          { key: 'shortcode', label: 'Paybill / Shortcode', masked: cfg.shortcode ?? '', set: Boolean(cfg.shortcode) },
          { key: 'passkey', label: 'Passkey', masked: maskValue(cfg.passkey), set: Boolean(cfg.passkey) },
          { key: 'b2cInitiatorName', label: 'B2C Initiator', masked: cfg.b2cInitiatorName ?? '', set: Boolean(cfg.b2cInitiatorName) },
          { key: 'callbackUrl', label: 'Callback URL', masked: cfg.callbackUrl ?? '', set: Boolean(cfg.callbackUrl) },
        ];
        break;
      case 'PESAPAL':
        fields = [
          { key: 'consumerKey', label: 'Consumer Key', masked: maskValue(cfg.consumerKey), set: Boolean(cfg.consumerKey) },
          { key: 'consumerSecret', label: 'Consumer Secret', masked: maskValue(cfg.consumerSecret), set: Boolean(cfg.consumerSecret) },
          { key: 'ipnUrl', label: 'IPN URL', masked: cfg.ipnUrl ?? '', set: Boolean(cfg.ipnUrl) },
        ];
        break;
      case 'SMTP':
        fields = [
          { key: 'host', label: 'SMTP Host', masked: cfg.host ?? '', set: Boolean(cfg.host) },
          { key: 'port', label: 'Port', masked: cfg.port ?? '', set: Boolean(cfg.port) },
          { key: 'user', label: 'Username', masked: cfg.user ?? '', set: Boolean(cfg.user) },
          { key: 'fromEmail', label: 'From email', masked: cfg.fromEmail ?? '', set: Boolean(cfg.fromEmail) },
        ];
        break;
      case 'SMS_GATEWAY':
        fields = [
          { key: 'provider', label: 'Gateway (AT/generic)', masked: cfg.provider ?? '', set: Boolean(cfg.provider) },
          { key: 'username', label: 'Username', masked: cfg.username ?? '', set: Boolean(cfg.username) },
          { key: 'apiKey', label: 'API Key', masked: maskValue(cfg.apiKey), set: Boolean(cfg.apiKey) },
          { key: 'senderId', label: 'Sender ID', masked: cfg.senderId ?? '', set: Boolean(cfg.senderId) },
        ];
        break;
      case 'SOCIAL':
        fields = [
          { key: 'youtubeUrl', label: 'YouTube', masked: cfg.youtubeUrl ?? '', set: Boolean(cfg.youtubeUrl) },
          { key: 'tiktokUrl', label: 'TikTok', masked: cfg.tiktokUrl ?? '', set: Boolean(cfg.tiktokUrl) },
          { key: 'facebookUrl', label: 'Facebook', masked: cfg.facebookUrl ?? '', set: Boolean(cfg.facebookUrl) },
          { key: 'whatsappUrl', label: 'WhatsApp Channel', masked: cfg.whatsappUrl ?? '', set: Boolean(cfg.whatsappUrl) },
          { key: 'twitterUrl', label: 'X (Twitter)', masked: cfg.twitterUrl ?? '', set: Boolean(cfg.twitterUrl) },
          { key: 'linkedinUrl', label: 'LinkedIn', masked: cfg.linkedinUrl ?? '', set: Boolean(cfg.linkedinUrl) },
        ];
        break;
    }
    out.push({
      provider: p, status: row?.status ?? 'PENDING', environment: row?.environment ?? 'SANDBOX',
      demoMode: row?.demoMode ?? false, lastCheckedAt: row?.lastCheckedAt ?? null,
      lastError: row?.lastError ?? null, fields,
    });
  }
  return ok(out);
});

const saveSchema = z.object({
  environment: z.enum(['SANDBOX', 'PRODUCTION']).optional(),
  demoMode: z.boolean().optional(),
  values: z.record(z.string(), z.string()),
});

export const PUT = withPermission('integrations_manage', async ({ req, params, session }) => {
  const { provider } = params;
  if (!PROVIDERS.includes(provider as never)) return err('Unknown provider', 404);
  const d = await body(req, saveSchema);
  const row = await db.integrationCredential.findUnique({ where: { provider } });
  let existing: Record<string, string> = {};
  if (row?.config) { try { existing = decryptJson(row.config as unknown as string); } catch { existing = {}; } }
  // merge: new non-empty values replace; blank keeps existing (never blank-out secrets accidentally)
  const merged: Record<string, string> = { ...existing };
  for (const [k, v] of Object.entries(d.values)) {
    if (v === '' && existing[k]) continue; // keep existing when blank submitted
    merged[k] = v;
  }
  const encrypted = encryptJson(merged);
  const updated = await db.integrationCredential.upsert({
    where: { provider },
    create: { provider, config: encrypted, environment: d.environment ?? 'SANDBOX', demoMode: d.demoMode ?? false, status: 'PENDING', updatedById: session.user.id },
    update: { config: encrypted, environment: d.environment ?? undefined, demoMode: d.demoMode ?? undefined, status: 'PENDING', updatedById: session.user.id },
  });
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'INTEGRATION_SAVE', module: 'integrations', entity: 'IntegrationCredential', entityId: updated.id, after: { provider, keys: Object.keys(merged) }, severity: 'critical' });

  // auto-test + status update (activates automatically — guide §14.2.1)
  let status = updated.status;
  if (provider === 'SOCIAL') {
    status = 'CONNECTED';
  } else {
    const test = await testProvider(provider as typeof PROVIDERS[number], merged);
    status = test.ok ? 'CONNECTED' : 'ERROR';
    await db.integrationCredential.update({
      where: { provider },
      data: { status, lastCheckedAt: new Date(), lastError: test.ok ? null : test.message },
    });
  }
  if (provider === 'SOCIAL') await db.integrationCredential.update({ where: { provider }, data: { status: 'CONNECTED', lastCheckedAt: new Date() } });
  return ok({ provider, status });
});

async function testProvider(provider: typeof PROVIDERS[number], cfg: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  if (provider === 'MPESA_DARAJA') {
    const save = { ...cfg, environment: cfg.environment ?? 'SANDBOX' };
    // darajaTest reads DB; emulate via direct OAuth
    const base = save.environment === 'PRODUCTION' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    if (!cfg.consumerKey || !cfg.consumerSecret) return { ok: false, message: 'Consumer key/secret missing' };
    try {
      const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
      const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
      const json = await res.json() as any;
      return { ok: Boolean(json?.access_token), message: json?.access_token ? 'OAuth token issued' : `HTTP ${res.status}` };
    } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
  if (provider === 'PESAPAL') {
    if (!cfg.consumerKey || !cfg.consumerSecret) return { ok: false, message: 'Keys missing' };
    try {
      const res = await fetch('https://cyberrazor-sandbox.pesapal.com/api/auth/request-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ consumer_key: cfg.consumerKey, consumer_secret: cfg.consumerSecret }),
      });
      const json = await res.json() as any;
      return { ok: Boolean(json?.token), message: json?.token ? 'Token issued' : (json?.error?.message ?? `HTTP ${res.status}`) };
    } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
  if (provider === 'SMTP') {
    if (!cfg.host || !cfg.user || !cfg.pass) return { ok: false, message: 'Host/user/password missing' };
    try {
      const brand = await getBrand();
      const mail = brandedEmail({ brand, title: 'SMTP connected', bodyHtml: '<p>Your email integration is now live. Every message will carry this branded layout.</p>' });
      await sendEmail(cfg.fromEmail || cfg.user, mail.subject, mail.html);
      return { ok: true, message: 'Test email sent to the from-address' };
    } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
  if (provider === 'SMS_GATEWAY') {
    if (!cfg.apiKey) return { ok: false, message: 'API key missing' };
    // no free balance endpoint on AT; validate shape only
    return { ok: Boolean(cfg.apiKey && (cfg.username || cfg.baseUrl)), message: 'Key stored — will be used on next send' };
  }
  return { ok: true, message: 'Links saved' };
}
