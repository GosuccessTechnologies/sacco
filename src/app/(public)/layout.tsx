import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/files';
import { decryptJson } from '@/lib/core-utils';
import './public.css';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSettings('seo').catch(() => null);
  return {
    title: { default: 'Divine Sacco Society Ltd — Growing Together, Prospering Together', template: seo?.titleTemplate ?? '%s — Divine Sacco' },
    description: seo?.description,
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const entity = await getSettings('entity');

  // dynamic data for header/footer
  const [savingsProducts, loanProducts, socialRow, logoRec] = await Promise.all([
    db.savingsProduct.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: 'asc' }, select: { name: true, code: true } }).catch(() => []),
    db.loanProduct.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: 'asc' }, select: { name: true, code: true } }).catch(() => []),
    db.integrationCredential.findUnique({ where: { provider: 'SOCIAL' } }).catch(() => null),
    entity.logoFileId ? db.fileRecord.findUnique({ where: { id: entity.logoFileId } }).catch(() => null) : Promise.resolve(null),
  ]);

  let social: Record<string, string> = {};
  if (socialRow?.config) {
    try { social = decryptJson<Record<string, string>>(socialRow.config as unknown as string); } catch { /* not set */ }
  }

  return (
    <div className="public-shell flex min-h-screen w-full flex-col">
      <PublicHeader
        entity={entity}
        logoUrl={logoRec ? fileUrl(logoRec) : null}
        savingsProducts={savingsProducts.map((p) => ({ ...p, kind: 'savings' as const }))}
        loanProducts={loanProducts.map((p) => ({ ...p, kind: 'loan' as const }))}
        social={social}
      />
      {/* Full-width main — every landing section spans edge to edge with inner
          .public-container wrappers (Instr 3). Login renders its own standalone
          split layout and must not get the shared chrome (Instr 4). */}
      <main className="w-full flex-1">{children}</main>
      <PublicFooter
        entity={entity}
        savingsProducts={savingsProducts}
        loanProducts={loanProducts}
        social={social}
      />
    </div>
  );
}
