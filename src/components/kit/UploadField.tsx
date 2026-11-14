'use client';
// ============================================================================
// UploadField — DEVELOPER_GUIDE.md §7.5. Drag & drop + browse + image URL
// import, client-side compression (canvas), upload to /api/files.
// ============================================================================
import * as React from 'react';
import { Link2, UploadCloud, X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export interface UploadedFile { id: string; url: string; originalName: string; mime: string; size: number; external?: boolean }

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (blob && blob.size < file.size) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    return file;
  } catch { return file; }
}

export function UploadField({
  moduleName,
  value,
  onChange,
  accept = 'image/*,application/pdf',
  label = 'Drag & drop, browse, or import from a link',
  compact = false,
}: {
  moduleName: string;
  value: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
  accept?: string;
  label?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = React.useState<'drop' | 'link'>('drop');
  const [busy, setBusy] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const inputId = React.useId();

  async function upload(file: File) {
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed);
      fd.append('moduleName', moduleName);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Upload failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as UploadedFile;
      onChange(data);
      toast({ title: 'File uploaded', description: `${data.originalName} · ${(data.size / 1024).toFixed(0)} KB` });
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function importLink() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/files/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), moduleName }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Could not import that link');
      }
      const data = (await res.json()) as UploadedFile;
      onChange({ ...data, external: true });
      setUrl('');
      toast({ title: 'Imported from link', description: data.originalName });
    } catch (e) {
      toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        <button type="button" className={`rounded-md px-2.5 py-1 ${mode === 'drop' ? 'bg-[var(--t-primary)]/10 font-semibold text-[var(--t-primary)]' : 'text-[var(--t-muted-text)]'}`} onClick={() => setMode('drop')}>Upload</button>
        <button type="button" className={`rounded-md px-2.5 py-1 ${mode === 'link' ? 'bg-[var(--t-primary)]/10 font-semibold text-[var(--t-primary)]' : 'text-[var(--t-muted-text)]'}`} onClick={() => setMode('link')}>From link</button>
      </div>

      {mode === 'drop' ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload file"
          onKeyDown={(e) => e.key === 'Enter' && document.getElementById(inputId)?.click()}
          onClick={() => document.getElementById(inputId)?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${compact ? 'p-4' : 'p-8'} ${dragOver ? 'border-[var(--t-primary)] bg-[var(--t-primary)]/5' : 'border-[var(--t-border)] bg-[var(--t-table-header-a)]'}`}
        >
          <input id={inputId} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-[var(--t-primary)]" /> : <UploadCloud className="h-7 w-7 text-[var(--t-primary)]" />}
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-[var(--t-muted-text)]">Images auto-compressed · max 10 MB · {accept.includes('pdf') ? 'PDF, images' : 'images'}</p>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--t-muted-text)]" />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/photo.jpg" className="dsms-input h-10 pl-8" />
          </div>
          <Button type="button" onClick={importLink} disabled={busy || !url.trim()} className="bg-[var(--t-primary)] text-white">Import</Button>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-3 rounded-lg border bg-[var(--t-surface)] p-2">
          {value.mime.startsWith('image/') ? (
            <img src={value.external ? value.url : value.url} alt={value.originalName} className="h-14 w-14 rounded-md object-cover" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-md bg-[var(--t-table-header-a)]"><ImageIcon className="h-6 w-6 text-[var(--t-muted-text)]" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.originalName}</p>
            <p className="text-xs text-[var(--t-muted-text)]">{(value.size / 1024).toFixed(0)} KB · {value.external ? 'external link' : 'uploaded'}{value.id ? ` · ${value.id.slice(0, 8)}` : ''}</p>
          </div>
          <button type="button" aria-label="Remove file" className="act-btn act-delete" onClick={() => onChange(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}
