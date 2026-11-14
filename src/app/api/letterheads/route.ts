// Letterheads list — GET (guide §7.2).
import { withAuth, ok } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = withAuth(null, async () => {
  const rows = await db.letterhead.findMany({ orderBy: { name: 'asc' } });
  return ok(rows.map((l) => ({ id: l.id, name: l.name, active: l.active, system: l.system, design: l.design })));
});
