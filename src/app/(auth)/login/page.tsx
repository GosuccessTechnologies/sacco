import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/public/LoginForm';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/files';
import '../../(public)/public.css';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const entity = await getSettings('entity');
  const logoRec = entity.logoFileId
    ? await db.fileRecord.findUnique({ where: { id: entity.logoFileId } }).catch(() => null)
    : null;
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>}>
      <LoginForm
        brand={{
          name: entity.name, tagline: entity.tagline, slogan: entity.slogan,
          phone: entity.phone, email: entity.email, website: entity.website,
          logoUrl: logoRec ? fileUrl(logoRec) : null,
        }}
      />
    </Suspense>
  );
}
