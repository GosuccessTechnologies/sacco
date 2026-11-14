// ============================================================================
// DSMS utilities: CSV, sequence, crypto (credentials), HTML sanitizer
// ============================================================================

// ------------------------------------------------------------------ CSV (RFC4180-ish, quotes, commas, newlines, BOM)
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (s.includes('"')) s = s.replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) s = `"${s}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] }[] {
  const src = text.replace(/^\uFEFF/, '');
  const blocks: { headers: string[]; rows: Record<string, string>[] }[] = [];
  // split into sheets by blank lines OR just parse whole (multi-block support: template header + example rows)
  const rows = parseRows(src);
  if (!rows.length) return blocks;
  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  blocks.push({ headers, rows: dataRows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))) });
  return blocks;
}

function parseRows(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// ------------------------------------------------------------------ sequences
import { db } from '@/lib/db';

const PREFIXES = {
  member: ['DIV-', 'DIV-'],
  savings: ['DIVS-', 'DIVS-'],
  loan: ['DIVL-', 'DIVL-'],
  loanApp: ['DIVAPP-', 'DIVAPP-'],
  share: ['DIVSH-', 'DIVSH-'],
  journal: ['JE-', 'JE-'],
} as const;
export type SeqKey = keyof typeof PREFIXES;

const LAST_SEQ: Record<string, number> = {};

/** Generates a human id inside a transaction by max-scan of existing numbers. */
export async function nextSequence(tx: typeof db, kind: SeqKey): Promise<string> {
  const [prefix] = PREFIXES[kind];
  let table: string, col: string;
  switch (kind) {
    case 'member': table = 'MemberProfile'; col = 'memberNumber'; break;
    case 'savings': table = 'SavingsAccount'; col = 'accountNumber'; break;
    case 'loan': table = 'Loan'; col = 'loanNumber'; break;
    case 'loanApp': table = 'LoanApplication'; col = 'applicationNumber'; break;
    case 'share': table = 'ShareTransaction'; col = 'certificateRef'; break;
    case 'journal': table = 'JournalEntry'; col = 'entryNo'; break;
  }
  const rows = await (tx as any)[table].findMany({ where: { [col]: { startsWith: prefix } }, select: { [col]: true } });
  let max = LAST_SEQ[kind] ?? 0;
  for (const r of rows) {
    const m = /[0-9]+$/.exec(String(r[col] ?? ''));
    if (m) max = Math.max(max, parseInt(m[0], 10));
  }
  const next = (LAST_SEQ[kind] = Math.max(max, LAST_SEQ[kind] ?? 0) + 1);
  return `${prefix}${String(next).padStart(6, '0')}`;
}

export const seqNo = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// ------------------------------------------------------------------ crypto (credentials at rest)
import crypto from 'node:crypto';

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY || 'dev-insecure-key';
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

export function encryptJson(data: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptJson<T>(payload: string): T {
  const [v, ivB, tagB, dataB] = payload.split(':');
  if (v !== 'v1') throw new Error('bad payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------------ HTML sanitizer (rich text)
const ALLOWED_TAGS = new Set([
  'p','br','b','strong','i','em','u','s','h1','h2','h3','h4','h5','h6','ul','ol','li',
  'blockquote','hr','a','img','video','source','span','div','table','thead','tbody','tr','td','th',
  'pre','code','sub','sup','font','figure','figcaption','center','small','section','article',
]);
const ALLOWED_ATTRS = new Set([
  'href','src','alt','title','target','rel','style','color','size','face','width','height',
  'align','colspan','rowspan','class','id','controls','autoplay','loop','muted','poster','type',
]);

/** Whitelist sanitizer for rich text (Word paste preserved, scripts stripped). */
export function sanitizeHtml(html: string): string {
  html = html
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, 'blocked:');
  return html.replace(/<\s*\/?\s*([a-zA-Z0-9-]+)((?:\s+[^<>]*)?)\/?\s*>/g, (match, tag: string, attrs: string) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) return '';
    const kept: string[] = [];
    const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrs ?? ''))) {
      const name = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? '';
      if (ALLOWED_ATTRS.has(name)) kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    const isClose = /^\s*<\s*\//.test(match);
    return isClose ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}${kept.length ? ' ' + kept.join(' ') : ''}>`;
  });
}

// plain-text excerpt for lists/previews
export function htmlExcerpt(html: string, max = 140): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}
