import { withPermission } from '@/lib/api';
import { saveUpload } from '@/lib/files';

export const POST = withPermission('files_view', async ({ req, session }) => {
  const form = await req.formData();
  const file = form.get('file');
  const moduleName = String(form.get('moduleName') ?? 'GENERAL');
  if (!(file instanceof File)) return Response.json({ error: 'No file provided' }, { status: 400 });
  const saved = await saveUpload(file, moduleName, { uploadedById: session.user.id });
  return Response.json(saved);
});
