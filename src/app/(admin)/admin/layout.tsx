// Admin layout — auth guard (staff only) + shell (guide §2.3).
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { AdminShell } from '@/components/modules/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect('/login?next=/admin');
  if (user.role === 'MEMBER' && !user.actAs) redirect('/dashboard');
  const entity = await getSettings('entity');
  return <AdminShell entityName={entity.name}>{children}</AdminShell>;
}
