// Themes — list + apply/duplicate/update (guide §7.1.5).
import { withAuth, withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export const GET = withAuth(null, async () => {
  const themes = await db.theme.findMany({ orderBy: { name: 'asc' } });
  return ok(themes.map((t) => ({
    id: t.id, name: t.name, description: t.description ?? '',
    active: t.active, system: t.system, isDarkReady: t.isDarkReady,
    tokens: t.tokens,
  })));
});

const applySchema = z.object({});
export const POST = withPermission('settings_themes', async ({ req, params, session }) => {
  const { id } = params;
  const theme = await db.theme.findUnique({ where: { id } });
  if (!theme) return err('Theme not found', 404);
  await db.theme.updateMany({ data: { active: false } });
  await db.theme.update({ where: { id }, data: { active: true } });
  revalidatePath('/', 'layout');
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'THEME_APPLY', module: 'settings', entity: 'Theme', entityId: id, after: { name: theme.name }, severity: 'info' });
  return ok({ applied: theme.name });
});
