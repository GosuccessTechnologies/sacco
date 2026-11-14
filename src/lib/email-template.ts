// ============================================================================
// Branded universal email layout — DEVELOPER_GUIDE.md §21.1 + Instr 8 overhaul.
// ONE design for every email the system sends: preheader, gradient hero header
// (entity logo/name/tagline + accent bar), title block, rich body, CTA button,
// divider, branded footer (contacts from entity config, socials, reg no,
// unsubscribe for marketing). Table-based + inline CSS only; 600px; safe in
// Gmail/Outlook/Thunderbird.
// ============================================================================
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export interface BrandInfo {
  name: string; tagline: string; slogan: string;
  phone: string; altPhone: string; email: string; website: string;
  address: string; town: string; country: string; registrationNo: string;
  logoUrl: string | null;
  primary: string; primaryDark: string; onPrimary: string; accent: string;
  social: { youtube?: string; tiktok?: string; facebook?: string; whatsapp?: string; twitter?: string; linkedin?: string };
}

export async function getBrand(): Promise<BrandInfo> {
  const [entity, socialRow, theme] = await Promise.all([
    getSettings('entity'),
    db.integrationCredential.findUnique({ where: { provider: 'SOCIAL' } }),
    db.theme.findFirst({ where: { active: true } }),
  ]);
  let social: BrandInfo['social'] = {};
  if (socialRow?.config) {
    try {
      const { decryptJson } = await import('@/lib/core-utils');
      social = decryptJson<Record<string, string>>(socialRow.config as unknown as string);
    } catch { /* not configured */ }
  }
  const tokens = (theme?.tokens as any) ?? {};
  const logoUrl = entity.logoFileId
    ? `${baseUrl()}/api/files/${entity.logoFileId}/raw`
    : null;
  return {
    name: entity.name, tagline: entity.tagline, slogan: entity.slogan,
    phone: entity.phone, altPhone: entity.altPhone, email: entity.email, website: entity.website,
    address: entity.physicalAddress, town: entity.town, country: entity.country,
    registrationNo: entity.registrationNo,
    logoUrl,
    primary: tokens?.colors?.primary ?? '#0E7C5A',
    primaryDark: tokens?.colors?.sidebar ?? '#0A5C43',
    onPrimary: '#FFFFFF',
    accent: tokens?.colors?.accent ?? '#F2B33C',
    social,
  };
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_CDN_PREFIX || 'http://localhost:3000';
}

const SOCIAL_LABELS: [keyof BrandInfo['social'], string][] = [
  ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'],
  ['whatsapp', 'WhatsApp'], ['twitter', 'X'], ['linkedin', 'LinkedIn'],
];

export function brandedEmail(opts: {
  brand: BrandInfo;
  title: string;
  bodyHtml: string;
  preheader?: string;
  ctaLabel?: string;
  ctaHref?: string;
  unsubscribe?: boolean;
}): { subject: string; html: string } {
  const { brand } = opts;
  const year = new Date().getFullYear();

  const socialLinks = SOCIAL_LABELS
    .filter(([k]) => Boolean(brand.social[k]))
    .map(([k, label]) => `<a href="${brand.social[k]}" style="color:#CFE2D8;text-decoration:none;font-size:11px;margin:0 7px;">${label}</a>`)
    .join('<span style="color:#5F7A6E;">·</span>');
  const socialHtml = socialLinks
    ? `<div style="margin:10px 0 2px;">${socialLinks}</div>`
    : '';

  // initials monogram when no logo is uploaded
  const monogram = brand.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return {
    subject: opts.title.includes(brand.name) ? opts.title : `${opts.title} — ${brand.name}`,
    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#EDF2EF;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<!-- preheader (hidden preview text) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader ?? opts.title}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF2EF;padding:24px 8px;">
<tr><td align="center">

<!-- ============================== EMAIL CARD -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.09);">

  <!-- HERO HEADER -->
  <tr><td style="background:linear-gradient(135deg,${brand.primary} 0%,${brand.primaryDark} 100%);background-color:${brand.primary};padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:24px 28px 18px;">
          <table role="presentation" width="100%"><tr>
            <td style="vertical-align:middle;width:56px;">
              ${brand.logoUrl
                ? `<img src="${brand.logoUrl}" alt="${brand.name}" width="48" height="48" style="border-radius:10px;display:block;background:#ffffff22;padding:4px;">`
                : `<span style="display:inline-block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:10px;background:rgba(255,255,255,.16);color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:.5px;">${monogram}</span>`}
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div style="color:#FFFFFF;font-size:18px;font-weight:bold;line-height:1.25;">${brand.name}</div>
              <div style="color:#E8F5EF;font-size:11.5px;margin-top:2px;">${brand.tagline}</div>
            </td>
          </tr></table>
        </td>
      </tr>
      <!-- accent bar -->
      <tr><td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="34%" style="height:4px;background:${brand.accent};font-size:0;line-height:0;">&nbsp;</td>
          <td width="66%" style="height:4px;background:rgba(255,255,255,.18);font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- TITLE + BODY -->
  <tr><td style="padding:30px 28px 8px;">
    <h1 style="margin:0 0 16px;font-size:21px;color:#17332A;line-height:1.3;font-family:Georgia,'Times New Roman',serif;">${opts.title}</h1>
    <div style="font-size:14px;color:#2E4038;line-height:1.7;">${opts.bodyHtml}</div>
    ${opts.ctaLabel && opts.ctaHref ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;"><tr>
      <td style="border-radius:10px;background:${brand.primary};">
        <a href="${opts.ctaHref}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:${brand.primary};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:14px;">${opts.ctaLabel}&nbsp;&rarr;</a>
      </td>
    </tr></table>
    <p style="margin:10px 0 0;font-size:11px;color:#7C8F86;word-break:break-all;">Or copy this link: <a href="${opts.ctaHref}" style="color:${brand.primary};">${opts.ctaHref}</a></p>
    ` : ''}
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="padding:22px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:1px solid #E3ECE7;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <!-- HELP STRIP -->
  <tr><td style="padding:16px 28px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F9F6;border-radius:10px;"><tr>
      <td style="padding:14px 16px;font-size:12px;color:#4E6357;line-height:1.7;">
        <strong style="color:#17332A;">Need help?</strong><br>
        Call <a href="tel:${brand.phone.replace(/[\s]/g, '')}" style="color:${brand.primary};text-decoration:none;font-weight:bold;">${brand.phone}</a>${brand.altPhone ? ` or <a href="tel:${brand.altPhone.replace(/[\s]/g, '')}" style="color:${brand.primary};text-decoration:none;font-weight:bold;">${brand.altPhone}</a>` : ''}<br>
        Email <a href="mailto:${brand.email}" style="color:${brand.primary};text-decoration:none;font-weight:bold;">${brand.email}</a> · <a href="${brand.website}" style="color:${brand.primary};text-decoration:none;">${brand.website.replace(/^https?:\/\//, '')}</a>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#17332A;padding:22px 28px;color:#CFE2D8;font-size:11.5px;line-height:1.75;text-align:center;">
    <div><strong style="color:#FFFFFF;">${brand.name}</strong> · ${brand.address}, ${brand.town}, ${brand.country}</div>
    <div>Reg ${brand.registrationNo} · SASRA regulated · ${brand.slogan}</div>
    ${socialHtml}
    ${opts.unsubscribe ? `<div style="margin-top:8px;"><a href="${baseUrl()}/contact" style="color:#9FC4B4;">Unsubscribe from marketing emails</a></div>` : ''}
    <div style="margin-top:8px;color:#9FC4B4;">© ${year} ${brand.name}. All rights reserved.</div>
    <div style="margin-top:4px;color:#6E8A7C;font-size:10.5px;">This message was sent by an automated system — replies may not be monitored.</div>
  </td></tr>
</table>

<!-- spacer -->
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr></table>
</body></html>`,
  };
}

/** SMS universal footer for marketing. */
export function smsFooter(brand: BrandInfo, marketing: boolean): string {
  return marketing ? `\n— ${brand.name}. Reply STOP to opt out.` : `\n— ${brand.name}`;
}
