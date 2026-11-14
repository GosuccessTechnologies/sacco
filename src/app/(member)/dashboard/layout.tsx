// Member layout — guard + PWA shell (guide §7.7).
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { MemberShell } from '@/components/modules/MemberShell';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect('/login?next=/dashboard');
  if (user.role !== 'MEMBER' && !user.actAs) redirect('/admin');
  const entity = await getSettings('entity');
  return <MemberShell entityName={entity.name} tagline={entity.tagline}>{children}</MemberShell>;
}
