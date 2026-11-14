// ============================================================================
// Notification engine — DEVELOPER_GUIDE.md §16.2.2 pipeline + §21 branding.
// Email (SMTP/Nodemailer) + SMS (HTTP gateway) + in-app Notification.
// Failures NEVER crash the parent flow; queued states are visible to admins.
// ============================================================================
import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { decryptJson } from '@/lib/core-utils';
import { brandedEmail, getBrand, smsFooter, type BrandInfo } from '@/lib/email-template';

export interface CredentialRow { provider: string; config: unknown; demoMode: boolean; status: string }

async function credential(provider: string) {
  const row = await db.integrationCredential.findUnique({ where: { provider } });
  if (!row?.config) return null;
  try {
    const cfg = decryptJson<Record<string, string>>(row.config as unknown as string);
    return { cfg, row };
  } catch { return null; }
}

// ------------------------------------------------------------------ SMTP mailer
let cachedTransport: { key: string; transporter: nodemailer.Transporter } | null = null;

async function smtpMailer() {
  const got = await credential('SMTP');
  if (!got) return { ok: false as const, reason: 'SMTP credentials not configured' as const, transporter: null };
  const { cfg } = got;
  const key = JSON.stringify([cfg.host, cfg.port, cfg.user]);
  if (cachedTransport && cachedTransport.key === key) return { ok: true as const, transporter: cachedTransport.transporter };
  const transporter = nodemailer.createTransport({
    host: cfg.host, port: Number(cfg.port || 587), secure: cfg.secure === 'true' || cfg.secure === true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedTransport = { key, transporter };
  return { ok: true as const, transporter };
}

// ------------------------------------------------------------------ SMS sender
async function smsSender() {
  const got = await credential('SMS_GATEWAY');
  if (!got) return { ok: false as const, reason: 'SMS gateway credentials not configured' as const };
  return { ok: true as const, cfg: got.cfg };
}

// ------------------------------------------------------------------ send email
export async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const brand = await getBrand();
  const row = await db.integrationCredential.findUnique({ where: { provider: 'SMTP' } });
  if (row?.demoMode) return { sent: true }; // SIMULATED — guide §14.2.1 demo mode
  const mailer = await smtpMailer();
  if (!mailer.ok) return { sent: false, error: mailer.reason };
  try {
    if (brand.logoUrl) {
      try { await fetch(brand.logoUrl, { method: 'HEAD' }); } catch { /* logo optional */ }
    }
    await mailer.transporter!.sendMail({
      from: `${brand.name} <${(await credential('SMTP'))!.cfg.user || 'noreply@divinesacco.co.ke'}>`,
      to, subject, html,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

// ------------------------------------------------------------------ send sms
export async function sendSms(to: string, text: string, marketing = false): Promise<{ sent: boolean; error?: string }> {
  const brand = await getBrand();
  const row = await db.integrationCredential.findUnique({ where: { provider: 'SMS_GATEWAY' } });
  if (row?.demoMode) return { sent: true }; // SIMULATED
  const gateway = await smsSender();
  if (!gateway.ok) return { sent: false, error: gateway.reason };
  const { cfg } = gateway;
  const finalText = `${text}${smsFooter(brand, marketing)}`;
  try {
    if (cfg.provider === 'AT' || !cfg.baseUrl) {
      // Africa's Talking default
      const res = await fetch('https://africastalking.com/sms/message/send', {
        method: 'POST',
        headers: { apiKey: cfg.apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ username: cfg.username || 'sandbox', to, message: finalText }),
      });
      if (!res.ok) return { sent: false, error: `Gateway HTTP ${res.status}` };
      return { sent: true };
    }
    // generic HTTP gateway (POST JSON {to, message} + Authorization)
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}`, ...(cfg.senderId ? { 'X-Sender': cfg.senderId } : {}) },
      body: JSON.stringify({ to, message: finalText, sender: cfg.senderId }),
    });
    if (!res.ok) return { sent: false, error: `Gateway HTTP ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

// ------------------------------------------------------------------ templates
export async function renderTemplate(code: string, context: Record<string, unknown>) {
  const brand = await getBrand();
  const ctx: Record<string, unknown> = {
    entity: brand.name, tagline: brand.tagline, phone: brand.phone, email: brand.email,
    website: brand.website, ...context,
  };
  const render = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (ctx[k] !== undefined ? String(ctx[k]) : `{{${k}}}`));

  const emailT = await db.messageTemplate.findFirst({ where: { code, channel: 'EMAIL', active: true } });
  const smsT = await db.messageTemplate.findFirst({ where: { code, channel: 'SMS', active: true } });

  const email = emailT
    ? brandedEmail({
        brand, title: render(emailT.subject ?? code), bodyHtml: render(emailT.body),
        preheader: render(emailT.subject ?? code),
      })
    : null;
  const sms = smsT ? render(smsT.body) : null;
  return { email, sms, brand };
}

// ------------------------------------------------------------------ notify one person
export interface NotifyResult { email?: { sent: boolean; error?: string }; sms?: { sent: boolean; error?: string } }

export async function notifyPerson(
  person: { name?: string | null; email?: string | null; phone?: string | null },
  templateCode: string,
  context: Record<string, unknown>,
  opts: { marketing?: boolean; ctaLabel?: string; ctaHref?: string } = {},
): Promise<NotifyResult> {
  const out: NotifyResult = {};
  if (!person.email && !person.phone) return out;
  const { email, sms, brand } = await renderTemplate(templateCode, context);
  if (person.email && email) {
    // CTA rendered through the branded layout (universal template) when provided
    let html = email.html;
    if (opts.ctaLabel && opts.ctaHref) {
      html = brandedEmail({
        brand, title: email.subject, bodyHtml: renderBody(email),
        preheader: email.subject, ctaLabel: opts.ctaLabel, ctaHref: opts.ctaHref,
        unsubscribe: opts.marketing,
      }).html;
    }
    const meta = email.subject.includes('—') ? { subject: email.subject } : { subject: `${email.subject} — ${brand.name}` };
    out.email = await sendEmail(person.email, meta.subject, html);
  }
  if (person.phone && sms) out.sms = await sendSms(person.phone, sms, opts.marketing ?? false);
  return out;
}

/** Extract the rendered body block from a branded email so it can be re-wrapped with a CTA. */
function renderBody(email: { html: string }): string {
  const m = email.html.match(/<div style="font-size:14px;color:#2E4038;line-height:1.7;">([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}

// ------------------------------------------------------------------ in-app notification
export async function inAppNotify(userId: string, title: string, body: string, type = 'INFO', link?: string) {
  try {
    await db.notification.create({ data: { userId, title, body, type, link } });
  } catch (e) { console.error('[notify] inApp failed', (e as Error).message); }
}

// ------------------------------------------------------------------ broadcast (bulk)
export interface Recipient { name?: string | null; email?: string | null; phone?: string | null }

export async function broadcast(
  channel: 'EMAIL' | 'SMS' | 'BOTH',
  subject: string,
  bodyHtml: string,
  recipients: Recipient[],
  sentById: string,
  marketing = false,
): Promise<{ logId: string; sent: number; failed: number }> {
  const log = await db.messageLog.create({
    data: {
      channel, subject: subject.slice(0, 200), bodyRendered: bodyHtml.slice(0, 100_000),
      recipientsCount: recipients.length, status: 'QUEUED', sentById,
    },
  });
  const results = await Promise.all(
    recipients.map(async (r, idx) => {
      const rec = await db.messageRecipient.create({
        data: { messageLogId: log.id, contactName: r.name ?? r.email ?? r.phone ?? `Recipient ${idx + 1}`, phone: r.phone ?? null, email: r.email ?? null },
      });
      let sent = false; let error: string | undefined;
      if ((channel === 'EMAIL' || channel === 'BOTH') && r.email) {
        const brand = await getBrand();
        const mail = brandedEmail({ brand, title: subject, bodyHtml, unsubscribe: marketing });
        const res = await sendEmail(r.email, mail.subject, mail.html);
        sent = sent || res.sent; error = res.error;
      }
      if ((channel === 'SMS' || channel === 'BOTH') && r.phone) {
        const plain = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const res = await sendSms(r.phone, plain, marketing);
        sent = sent || res.sent; error = error ?? res.error;
      }
      await db.messageRecipient.update({
        where: { id: rec.id },
        data: { status: sent ? 'SENT' : 'FAILED', error: error ?? null, sentAt: sent ? new Date() : null },
      });
      return sent;
    }),
  );
  const sentCount = results.filter(Boolean).length;
  const failed = results.length - sentCount;
  await db.messageLog.update({
    where: { id: log.id },
    data: {
      status: failed === 0 ? 'SENT' : sentCount > 0 ? 'PARTIAL' : 'FAILED',
      sentAt: new Date(),
      recipientsCount: results.length,
    },
  });
  return { logId: log.id, sent: sentCount, failed };
}
