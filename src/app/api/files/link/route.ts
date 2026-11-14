import { withPermission } from '@/lib/api';
import { importByUrl } from '@/lib/files';
import { z } from 'zod';

const schema = z.object({ url: z.string().url(), moduleName: z.string().default('GENERAL') });

export const POST = withPermission('files_view', async ({ req, session }) => {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid URL' }, { status: 422 });
  try {
    const saved = await importByUrl(parsed.data.url, parsed.data.moduleName, { uploadedById: session.user.id });
    return Response.json(saved);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
