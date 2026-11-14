// Cache management — toggle + clear (guide §19.3).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSettings, setSettings } from '@/lib/settings';
import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => ok(await getSettings('cache')));

export const POST = withPermission('settings_cache', async ({ req, session }) => {
  const d = await body(req, z.object({
    action: z.enum(['toggle', 'clear']),
    enabled: z.boolean().optional(),
  }));
  if (d.action === 'toggle') {
    const current = await getSettings('cache');
    const next = { ...current, enabled: d.enabled ?? !current.enabled };
    await setSettings('cache', next, session.user.id);
    await audit({ userId: session.user.id, userRole: session.user.role, action: 'CACHE_TOGGLE', module: 'settings', entity: 'SiteConfig', entityId: 'cache', after: next, severity: 'info' });
    return ok(next);
  }
  // clear: purge public + admin paths
  revalidatePath('/', 'layout');
  const adminPaths = ['', '/members', '/savings', '/loans', '/shares', '/accounting', '/payments', '/reports', '/communications', '/administration'];
  for (const p of adminPaths) revalidatePath(`/admin${p}`);
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'CACHE_CLEAR', module: 'settings', entity: 'revalidate', severity: 'info' });
  return ok({ cleared: true, note: 'Pages revalidated — fresh data on next load' });
});
