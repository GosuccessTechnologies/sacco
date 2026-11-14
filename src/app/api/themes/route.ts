// Themes list — GET (guide §7.1.5).
import { withAuth, ok } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth(null, async () => {
  const themes = await db.theme.findMany({ orderBy: { name: 'asc' } });
  return ok(themes.map((t) => ({
    id: t.id, name: t.name, description: t.description ?? '',
    active: t.active, system: t.system, isDarkReady: t.isDarkReady, tokens: t.tokens,
  })));
});
