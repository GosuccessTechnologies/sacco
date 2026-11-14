// ============================================================================
// File service — DEVELOPER_GUIDE.md §7.5. Whitelist, random names,
// data/uploads/YYYY/MM, FileRecord metadata, URL_IMPORT passthrough.
// ============================================================================
import { db } from '@/lib/db';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads');

export const MIME_WHITELIST = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf', 'text/csv', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export class FileError extends Error {}

export interface SavedFile { id: string; url: string; originalName: string; mime: string; size: number }

export async function saveUpload(file: File, moduleName: string, opts: { uploadedById?: string | null; recordId?: string | null } = {}): Promise<SavedFile> {
  if (file.size > MAX_SIZE * 2) throw new FileError('File too large (max 10MB after compression)');
  const mime = file.type || 'application/octet-stream';
  if (!MIME_WHITELIST.has(mime)) throw new FileError(`File type not allowed: ${mime}`);
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const now = new Date();
  const rel = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  await mkdir(path.join(UPLOAD_ROOT, rel), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_ROOT, rel, storedName), buf);
  const rec = await db.fileRecord.create({
    data: {
      moduleName, recordId: opts.recordId ?? null,
      originalName: file.name, storedName: `${rel}/${storedName}`,
      mime, size: buf.length, originalSize: file.size,
      compressed: buf.length < file.size, source: 'UPLOAD',
      uploadedById: opts.uploadedById ?? null,
    },
  });
  return { id: rec.id, url: `/api/files/${rec.id}/raw`, originalName: file.name, mime, size: buf.length };
}

export async function importByUrl(url: string, moduleName: string, opts: { uploadedById?: string | null } = {}): Promise<SavedFile> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new FileError('Invalid URL'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new FileError('Only http(s) URLs allowed');
  // HEAD check reachability + mime (best-effort)
  let mime = 'image/jpeg'; let size = 0;
  try {
    const res = await fetch(parsed, { method: 'HEAD' });
    if (!res.ok) throw new FileError(`URL not reachable (HTTP ${res.status})`);
    mime = res.headers.get('content-type')?.split(';')[0] ?? mime;
    size = Number(res.headers.get('content-length') ?? 0);
  } catch (e) {
    if (e instanceof FileError) throw e;
    // some servers reject HEAD — accept as unverified image link
    mime = 'image/jpeg';
  }
  if (!MIME_WHITELIST.has(mime)) throw new FileError(`URL content type not allowed: ${mime}`);
  const name = decodeURIComponent(parsed.pathname.split('/').pop() || 'imported').slice(0, 120) || 'imported';
  const rec = await db.fileRecord.create({
    data: {
      moduleName, originalName: name, externalUrl: url, mime,
      size: size || 0, originalSize: size || 0, compressed: false, source: 'URL_IMPORT',
      uploadedById: opts.uploadedById ?? null,
    },
  });
  return { id: rec.id, url, originalName: name, mime, size };
}

export async function readStored(storedName: string): Promise<Buffer> {
  return readFile(path.join(UPLOAD_ROOT, storedName));
}

export function fileUrl(rec: { id: string; externalUrl: string | null }): string {
  return rec.externalUrl ?? `/api/files/${rec.id}/raw`;
}
