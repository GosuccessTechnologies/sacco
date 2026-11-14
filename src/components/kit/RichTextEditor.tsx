'use client';
// ============================================================================
// RichTextEditor — DEVELOPER_GUIDE.md §7.6. Toolbar: formatting, headings,
// lists, fonts (30 Google Fonts), sizes, colors, links, images, videos,
// Word-paste preserving formatting. Theme-aware chrome.
// ============================================================================
import * as React from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Link2, ImagePlus, Video,
  Undo2, Redo2, RemoveFormatting, Type, FileInput, Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GOOGLE_FONTS } from '@/lib/constants';

const SIZES = [
  { v: '10px', l: '10' }, { v: '12px', l: '12' }, { v: '14px', l: 'Normal' },
  { v: '16px', l: '16' }, { v: '18px', l: '18' }, { v: '24px', l: '24' },
];
const COLORS = ['#1B2420', '#C0392B', '#1E8E5A', '#B7791F', '#2C7A7B', '#6D28D9', '#0E7C5A', '#F2B33C', '#FFFFFF'];

export function RichTextEditor({ value, onChange, placeholder = 'Write rich content…', minHeight = 180 }: { value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkText, setLinkText] = React.useState('');
  const [mediaOpen, setMediaOpen] = React.useState<'image' | 'video' | null>(null);
  const [mediaUrl, setMediaUrl] = React.useState('');
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteHtml, setPasteHtml] = React.useState('');

  React.useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || '';
  }, []);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Word paste preservation: keep text/html (formats), strip dangerous markup on save (server sanitizer)
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      const clean = html.replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
      document.execCommand('insertHTML', false, clean);
      onChange(ref.current?.innerHTML ?? '');
    }
  };

  return (
    <div className="rounded-xl border bg-[var(--t-surface)]" style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.14)' }}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-[var(--t-table-header-a)] rounded-t-xl px-1.5 py-1">
        <TB onClick={() => exec('undo')} title="Undo"><Undo2 className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('redo')} title="Redo"><Redo2 className="h-3.5 w-3.5" /></TB>
        <Div />
        <select className="h-7 rounded-md border bg-[var(--t-surface)] px-1 text-xs" onChange={(e) => exec('formatBlock', e.target.value)} defaultValue="" aria-label="Heading">
          <option value="" disabled>Style</option>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="blockquote">Quote</option>
        </select>
        <select className="h-7 max-w-36 rounded-md border bg-[var(--t-surface)] px-1 text-xs" onChange={(e) => exec('fontName', e.target.value)} defaultValue="" aria-label="Font">
          <option value="" disabled>Font</option>
          {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="h-7 rounded-md border bg-[var(--t-surface)] px-1 text-xs" onChange={(e) => exec('fontSize', e.target.value)} defaultValue="" aria-label="Size">
          <option value="" disabled>Size</option>
          {SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <Div />
        <TB onClick={() => exec('bold')} title="Bold"><Bold className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('italic')} title="Italic"><Italic className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('underline')} title="Underline"><Underline className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></TB>
        <Div />
        <TB onClick={() => exec('insertUnorderedList')} title="Bullets"><List className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('insertOrderedList')} title="Numbering"><ListOrdered className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('formatBlock', 'blockquote')} title="Quote"><Quote className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('insertHorizontalRule')} title="Divider"><Minus className="h-3.5 w-3.5" /></TB>
        <Div />
        <TB onClick={() => exec('justifyLeft')} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('justifyCenter')} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('justifyRight')} title="Align right"><AlignRight className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => exec('justifyFull')} title="Justify"><AlignJustify className="h-3.5 w-3.5" /></TB>
        <Div />
        <select className="h-7 w-8 rounded-md border bg-[var(--t-surface)] px-1 text-[10px]" onChange={(e) => exec('foreColor', e.target.value)} defaultValue="" aria-label="Text color">
          <option value="" disabled><Palette className="h-3 w-3" /></option>
          {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <TB onClick={() => setMediaOpen('image')} title="Insert image"><ImagePlus className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => setMediaOpen('video')} title="Insert video"><Video className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => { setLinkUrl(''); setLinkText(window.getSelection()?.toString() ?? ''); setLinkOpen(true); }} title="Insert link"><Link2 className="h-3.5 w-3.5" /></TB>
        <Div />
        <TB onClick={() => { setPasteHtml(''); setPasteOpen(true); }} title="Paste from Word"><FileInput className="h-3.5 w-3.5" /></TB>
        <TB onClick={() => { exec('removeFormat'); exec('formatBlock', 'p'); }} title="Clear formatting"><RemoveFormatting className="h-3.5 w-3.5" /></TB>
      </div>

      {/* canvas */}
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Rich text content"
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        onPaste={handlePaste}
        className="dsms-textarea px-4 py-3 text-sm leading-relaxed focus:outline-none"
        style={{ minHeight, boxShadow: 'none', border: 'none', borderRadius: 0 }}
        data-placeholder={placeholder}
      />

      {/* link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="card-hero px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Insert hyperlink</DialogTitle>
            <DialogDescription className="opacity-90">Links open in a new tab for safety.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Link text" className="dsms-input" />
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="dsms-input" />
          </div>
          <DialogFooter className="border-t bg-[var(--t-surface)] px-5 py-3">
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button className="bg-[var(--t-primary)] text-white" onClick={() => {
              const safe = /^https?:\/\//i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
              exec('insertHTML', `<a href="${safe}" target="_blank" rel="noopener noreferrer">${linkText || safe}</a>`);
              setLinkOpen(false);
            }}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* media dialog */}
      <Dialog open={mediaOpen !== null} onOpenChange={(o) => !o && setMediaOpen(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="card-hero px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">{mediaOpen === 'image' ? <ImagePlus className="h-4 w-4" /> : <Video className="h-4 w-4" />} Insert {mediaOpen}</DialogTitle>
            <DialogDescription className="opacity-90">Paste a URL — hosted anywhere on the internet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder={mediaOpen === 'image' ? 'https://…/photo.jpg' : 'https://www.youtube.com/watch?v=…'} className="dsms-input" />
            <p className="text-xs text-[var(--t-muted-text)]">YouTube/Vimeo links become responsive embeds automatically.</p>
          </div>
          <DialogFooter className="border-t bg-[var(--t-surface)] px-5 py-3">
            <Button variant="outline" onClick={() => setMediaOpen(null)}>Cancel</Button>
            <Button className="bg-[var(--t-primary)] text-white" onClick={() => {
              if (!mediaUrl) return;
              if (mediaOpen === 'image') {
                exec('insertHTML', `<img src="${mediaUrl}" alt="Embedded image" style="max-width:100%;border-radius:8px;" />`);
              } else {
                const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(mediaUrl);
                const vm = /vimeo\.com\/(\d+)/.exec(mediaUrl);
                if (yt) exec('insertHTML', `<div style="position:relative;padding-bottom:56.25%;height:0;margin:10px 0;"><iframe src="https://www.youtube.com/embed/${yt[1]}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px;" allowfullscreen title="Video"></iframe></div>`);
                else if (vm) exec('insertHTML', `<div style="position:relative;padding-bottom:56.25%;height:0;margin:10px 0;"><iframe src="https://player.vimeo.com/video/${vm[1]}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px;" allowfullscreen title="Video"></iframe></div>`);
                else exec('insertHTML', `<video src="${mediaUrl}" controls style="max-width:100%;border-radius:10px;margin:10px 0;"></video>`);
              }
              setMediaOpen(null); setMediaUrl('');
            }}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* paste-from-word dialog */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
          <DialogHeader className="card-hero px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base"><FileInput className="h-4 w-4" /> Paste from Word</DialogTitle>
            <DialogDescription className="opacity-90">Copy content in Word (Ctrl+A, Ctrl+C), paste below — formatting is preserved (bold, headings, lists, tables, colors).</DialogDescription>
          </DialogHeader>
          <div
            contentEditable
            className="dsms-textarea mx-5 my-4 min-h-40"
            onInput={(e) => setPasteHtml((e.target as HTMLDivElement).innerHTML)}
            style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.16)' }}
          />
          <DialogFooter className="border-t bg-[var(--t-surface)] px-5 py-3">
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button className="bg-[var(--t-primary)] text-white" onClick={() => {
              const clean = pasteHtml.replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
              exec('insertHTML', clean);
              setPasteOpen(false);
            }}>Insert content</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TB({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-[var(--t-text)] hover:bg-[var(--t-primary)]/12 hover:text-[var(--t-primary)]"
    >
      {children}
    </button>
  );
}
const Div = () => <span className="mx-1 h-5 w-px bg-[var(--t-border)]" />;
