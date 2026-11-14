// Public brand endpoint — used by exports/letterhead on the client + public loan calculator.
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { getActiveTheme } from '@/lib/theme';
import { fileUrl } from '@/lib/files';

export async function GET() {
  const [entity, theme] = await Promise.all([getSettings('entity'), getActiveTheme()]);
  let letterhead: { name: string; design: unknown } | null = null;
  try {
    const lh = await db.letterhead.findFirst({ where: { active: true } });
    letterhead = lh ? { name: lh.name, design: lh.design } : null;
  } catch { /* db not ready */ }
  let logo: { url: string | null; fileId: string | null } = { url: null, fileId: null };
  if (entity.logoFileId) {
    try {
      const rec = await db.fileRecord.findUnique({ where: { id: entity.logoFileId } });
      if (rec) logo = { url: fileUrl(rec), fileId: rec.id };
    } catch { /* ignore */ }
  }
  // public loan products — feed for the landing-page loan calculator (mirrors the real engine)
  let loanProducts: {
    id: string; code: string; name: string; interestMethod: string; interestRateBps: number;
    termMinMonths: number; termMaxMonths: number; minAmountCents: number; maxAmountCents: number;
    savingsMultiplier: number; requiredGuarantors: number; description: string | null;
  }[] = [];
  try {
    loanProducts = await db.loanProduct.findMany({
      where: { isPublic: true, active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, code: true, name: true, interestMethod: true, interestRateBps: true,
        termMinMonths: true, termMaxMonths: true, minAmountCents: true, maxAmountCents: true,
        savingsMultiplier: true, requiredGuarantors: true, description: true,
      },
    });
  } catch { /* db not ready */ }
  const colors = (theme.tokens as any)?.colors ?? {};
  return NextResponse.json({
    entity: {
      name: entity.name, tagline: entity.tagline, slogan: entity.slogan, registrationNo: entity.registrationNo,
      phone: entity.phone, altPhone: entity.altPhone, email: entity.email, website: entity.website,
      address: `${entity.physicalAddress}, ${entity.town}`, county: entity.county, currency: entity.currency,
    },
    logo,
    letterhead,
    loanProducts,
    colors: { primary: colors.primary ?? '#0E7C5A', primaryFg: colors.primaryFg ?? '#fff', text: colors.text ?? '#1B2420', mutedText: colors.mutedText ?? '#5C6B63', border: colors.border ?? '#DCE5DF' },
  });
}
