import { db } from '@/lib/db';
import { readStored } from '@/lib/files';

// Public raw file serving (validated stored names only, URL_IMPORT passthrough).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await db.fileRecord.findUnique({ where: { id } }).catch(() => null);
  if (!rec) return new Response('Not found', { status: 404 });
  if (rec.externalUrl) return Response.redirect(rec.externalUrl, 302);
  if (!rec.storedName) return new Response('Not found', { status: 404 });
  try {
    const buf = await readStored(rec.storedName);
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': rec.mime, 'Cache-Control': 'public, max-age=86400', 'Content-Disposition': `inline; filename="${encodeURIComponent(rec.originalName)}"` },
    });
  } catch {
    return new Response('Gone', { status: 410 });
  }
}
