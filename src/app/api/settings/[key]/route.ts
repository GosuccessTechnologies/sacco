// Settings groups — get/put typed (guide §17.4).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSettings, setSettings, SETTINGS_DEFAULTS } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

const ALLOWED_KEYS = Object.keys(SETTINGS_DEFAULTS);

export const GET = withAuth(null, async () => {
  const all: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) all[k] = await getSettings(k as never);
  return ok(all);
});

export const PUT = withPermission('settings_entity', async ({ req, params, session }) => {
  const { key } = params;
  if (!ALLOWED_KEYS.includes(key)) return err('Unknown settings group', 404);
  // finer permission mapping
  if (key === 'features' || key === 'limits') {
    if (session.user.role !== 'SUPER_ADMIN' && !session.user.permissions.includes('settings_features')) return err('Feature/limits permission required', 403);
  }
  const value = await body(req, z.object({}).passthrough());
  await setSettings(key as never, value, session.user.id);
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'SETTINGS_UPDATE', module: 'settings', entity: 'SiteConfig', entityId: key, after: value, severity: 'critical' });
  return ok({ key, saved: true });
});
