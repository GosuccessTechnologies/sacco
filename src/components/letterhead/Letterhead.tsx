// On-screen Letterhead — DEVELOPER_GUIDE.md §7.2.
// Renders the ACTIVE design with live entity details; used above documents,
// statements, payslips, receipts and any printed/exported content.
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { getActiveTheme } from '@/lib/theme';
import { fileUrl } from '@/lib/files';
import { fmtDate } from '@/lib/client-utils';

export interface LetterheadData {
  entity: { name: string; tagline: string; registrationNo: string; phone: string; altPhone: string; email: string; website: string; address: string };
  design: Record<string, any>;
  colors: { primary: string; text: string; mutedText: string; border: string };
  logoUrl: string | null;
}

export async function getLetterheadData(): Promise<LetterheadData> {
  const [entity, theme, activeLh] = await Promise.all([getSettings('entity'), getActiveTheme(), db.letterhead.findFirst({ where: { active: true } })]);
  let logoUrl: string | null = null;
  if (entity.logoFileId) {
    const rec = await db.fileRecord.findUnique({ where: { id: entity.logoFileId } }).catch(() => null);
    if (rec) logoUrl = fileUrl(rec);
  }
  const c = (theme.tokens as any)?.colors ?? {};
  return {
    entity: {
      name: entity.name, tagline: entity.tagline, registrationNo: entity.registrationNo,
      phone: entity.phone, altPhone: entity.altPhone, email: entity.email, website: entity.website,
      address: `${entity.physicalAddress}, ${entity.town}`,
    },
    design: (activeLh?.design ?? {}) as Record<string, any>,
    colors: { primary: c.primary ?? '#0E7C5A', text: c.text ?? '#1B2420', mutedText: c.mutedText ?? '#5C6B63', border: c.border ?? '#DCE5DF' },
    logoUrl,
  };
}

/** Server component: full letterhead band + content below it. */
export async function LetterheadDocument({
  title,
  meta,
  children,
  footerNote,
  docNo,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  footerNote?: string;
  docNo?: string;
}) {
  const lh = await getLetterheadData();
  const d = lh.design;
  const layout: string = d.headerLayout ?? 'centered';
  const accent = d.accentSource === 'theme' ? lh.colors.primary : '#0E7C5A';
  const isDark = layout === 'band' || layout === 'gradient' || layout === 'sidebar';

  const titleBlock = (
    <div className={layout === 'centered' ? 'text-center' : ''}>
      <div className="flex items-center gap-3" style={{ justifyContent: layout === 'centered' ? 'center' : 'flex-start' }}>
        {lh.logoUrl && <img src={lh.logoUrl} alt={`${lh.entity.name} logo`} style={{ height: d.logoSize ?? 44 }} className="rounded-lg" />}
        <div>
          <div style={{ fontFamily: 'var(--t-heading-font)', fontWeight: 700, fontSize: 20, color: isDark ? '#fff' : lh.colors.text, textTransform: d.titleCase === 'uppercase' ? 'uppercase' : 'none', letterSpacing: '.02em' }}>
            {lh.entity.name}
          </div>
          <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,.85)' : lh.colors.mutedText }}>{lh.entity.tagline}</div>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: isDark ? 'rgba(255,255,255,.85)' : lh.colors.mutedText, textAlign: layout === 'centered' ? 'center' : 'left' }}>
        {d.contactLayout === 'inline' ? (
          <span>{lh.entity.address} · {lh.entity.phone} · {lh.entity.email} · {lh.entity.website}</span>
        ) : (
          <span>{lh.entity.address}<br />{lh.entity.phone} · {lh.entity.altPhone}<br />{lh.entity.email} · {lh.entity.website}</span>
        )}
      </div>
    </div>
  );

  const bandStyle: React.CSSProperties = isDark
    ? { background: layout === 'gradient' ? `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 55%, #000))` : accent, padding: '22px 28px', color: '#fff' }
    : { padding: '22px 28px 10px' };

  return (
    <div className="print-area mx-auto w-full max-w-3xl rounded-xl border bg-[var(--t-surface)]" style={{ borderColor: lh.colors.border, overflow: 'hidden' }}>
      <div style={bandStyle}>
        {layout === 'sidebar' ? (
          <div className="flex gap-6">
            <div style={{ width: 6, background: accent, borderRadius: 3, flexShrink: 0 }} />
            {titleBlock}
          </div>
        ) : layout === 'split' ? (
          <div className="flex items-start justify-between gap-4">
            {titleBlock}
            <div className="text-right" style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,.85)' : lh.colors.mutedText }}>
              Reg: {lh.entity.registrationNo}
              {docNo && <><br />Doc: {docNo}</>}
              <br />Issued: {fmtDate(new Date())}
            </div>
          </div>
        ) : (
          titleBlock
        )}
        <div style={{ marginTop: 10, borderTop: `${d.ruleStyle === 'dashed' ? '2px dashed' : '3px solid'} ${accent}`, width: '100%' }} />
      </div>

      <div className="px-8 pt-5">
        <h2 style={{ fontFamily: 'var(--t-heading-font)', fontWeight: 700, fontSize: 16, color: lh.colors.text }}>{title}</h2>
        {meta && <p style={{ fontSize: 11, color: lh.colors.mutedText, marginTop: 2 }}>{meta}</p>}
      </div>
      <div className="px-8 py-5 text-sm" style={{ color: lh.colors.text }}>{children}</div>
      <div className="border-t px-8 py-3 text-xs" style={{ borderColor: lh.colors.border, color: lh.colors.mutedText }}>
        {footerNote ?? d.footerNote ?? 'Serving members with integrity'} · {lh.entity.name} · {lh.entity.registrationNo}
      </div>
    </div>
  );
}
