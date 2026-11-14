'use client';
// ============================================================================
// ExportBar — PDF (jsPDF, letterheaded) · CSV · Print (content only).
// DEVELOPER_GUIDE.md §7.2 + §7.3 #10. Each is a SEPARATE action.
// ============================================================================
import * as React from 'react';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ColumnSpec } from './DataTable';
import { fmtMoneyPlain } from '@/lib/client-utils';

export interface BrandData {
  entity: { name: string; tagline: string; registrationNo: string; phone: string; email: string; website: string; address: string; currency: string };
  logo: { url: string | null };
  letterhead: { name: string; design: Record<string, unknown> } | null;
  colors: { primary: string; primaryFg: string; text: string; mutedText: string; border: string };
}

let brandCache: BrandData | null = null;
async function getBrand(): Promise<BrandData> {
  if (brandCache) return brandCache;
  const res = await fetch('/api/public/brand');
  brandCache = (await res.json()) as BrandData;
  return brandCache;
}
export function invalidateBrand() { brandCache = null; }

export function ExportButtons({ title, subtitle, rows, columns }: { title: string; subtitle?: string; rows: Record<string, unknown>[]; columns: ColumnSpec<unknown>[] }) {
  const [busy, setBusy] = React.useState('');
  const stamp = () => new Date().toLocaleString('en-KE');

  async function exportPdf() {
    setBusy('pdf');
    try {
      const brand = await getBrand();
      const [{ default: JsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ]);
      const autoTable = (autoTableMod as any).default ?? autoTableMod;
      const doc = new JsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const c = brand.colors;
      // letterhead band
      doc.setFillColor(c.primary);
      doc.rect(0, 0, W, 64, 'F');
      doc.setTextColor('#FFFFFF');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(brand.entity.name, 40, 28);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(brand.entity.tagline, 40, 42);
      doc.text(`Reg ${brand.entity.registrationNo}`, W - 40, 28, { align: 'right' });
      doc.text(brand.entity.phone, W - 40, 42, { align: 'right' });
      // contacts line
      doc.setTextColor(c.text); doc.setFontSize(8.5);
      doc.text(`${brand.entity.address} · ${brand.entity.email} · ${brand.entity.website}`, 40, 80);
      doc.setDrawColor(c.primary); doc.setLineWidth(1.5);
      doc.line(40, 86, W - 40, 86);
      // module header
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(title, 40, 106);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(c.mutedText);
      doc.text(`${subtitle ?? ''}  ·  Generated ${stamp()}`, 40, 119);
      doc.text(`Records: ${rows.length}`, W - 40, 119, { align: 'right' });
      const head = [[ '#', ...columns.map((col) => col.header.toUpperCase())]];
      const body = rows.map((r, i) => [
        String(i + 1),
        ...columns.map((col) => cellText(col, r[col.key])),
      ]);
      autoTable(doc, {
        head, body, startY: 130,
        styles: { fontSize: 8, cellPadding: 4, textColor: c.text, lineColor: c.border, lineWidth: 0.5 },
        headStyles: { fillColor: c.primary, textColor: '#FFFFFF' },
        alternateRowStyles: { fillColor: '#F3F8F5' },
        margin: { left: 40, right: 40, bottom: 48 },
        didDrawPage: () => {
          const H = doc.internal.pageSize.getHeight();
          doc.setFontSize(8); doc.setTextColor(c.mutedText);
          doc.text(`${brand.entity.name} — system-generated document`, 40, H - 24);
          doc.text(`Page ${doc.getNumberOfPages()}`, W - 40, H - 24, { align: 'right' });
        },
      });
      doc.save(`${slug(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setBusy(''); }
  }

  function exportCsv() {
    const header = columns.map((col) => col.header).join(',');
    const lines = rows.map((r, i) => [
      i + 1, ...columns.map((col) => cellText(col, r[col.key])),
    ].map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const csv = '\uFEFF' + [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(title)}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function printTable() {
    setBusy('print');
    try {
      const brand = await getBrand();
      const c = brand.colors;
      const ths = columns.map((col) => `<th>${esc(col.header)}</th>`).join('');
      const trs = rows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td>${columns.map((col) => `<td>${esc(cellText(col, r[col.key]))}</td>`).join('')}</tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${c.text}; margin: 0; }
  .lh { background: ${c.primary}; color: #fff; padding: 22px 28px; }
  .lh h1 { margin: 0; font-size: 20px; }
  .lh p { margin: 4px 0 0; font-size: 11px; opacity: .92; }
  .lh .reg { float: right; text-align: right; font-size: 11px; opacity: .92; }
  .contacts { font-size: 11px; color: ${c.mutedText}; padding: 10px 28px 6px; border-bottom: 3px solid ${c.primary}; }
  h2 { font-size: 15px; margin: 18px 28px 2px; }
  .meta { font-size: 11px; color: ${c.mutedText}; margin: 0 28px 12px; }
  table { width: calc(100% - 56px); margin: 0 28px 20px; border-collapse: collapse; font-size: 11px; }
  thead th { background: ${c.primary}; color: #fff; padding: 7px 9px; text-align: left; border-right: 1px solid rgba(255,255,255,.25); }
  tbody td { padding: 6px 9px; border: 1px solid ${c.border}; border-right: 1px inset ${c.border}; }
  tbody tr:nth-child(even) { background: #F3F8F5; }
  tfoot { font-size: 10px; color: ${c.mutedText}; padding: 14px 28px; }
</style></head><body>
<div class="lh">
  <div class="reg">Reg ${esc(brand.entity.registrationNo)}<br>${esc(brand.entity.phone)}</div>
  <h1>${esc(brand.entity.name)}</h1>
  <p>${esc(brand.entity.tagline)}</p>
</div>
<div class="contacts">${esc(brand.entity.address)} · ${esc(brand.entity.email)} · ${esc(brand.entity.website)}</div>
<h2>${esc(title)}</h2>
<p class="meta">${esc(subtitle ?? '')} — generated ${stamp()} · ${rows.length} records</p>
<table><thead><tr><th style="text-align:center;width:36px">#</th>${ths}</tr></thead><tbody>${trs}</tbody></table>
<div class="tfoot">${esc(brand.entity.name)} — system-generated document · ${stamp()}</div>
</body></html>`;
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(frame);
      frame.srcdoc = html;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 4000);
      };
    } finally { setBusy(''); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={Boolean(busy)}>
          <FileDown className="mr-1 h-3.5 w-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportPdf} disabled={busy === 'pdf'}>
          <FileDown className="mr-2 h-4 w-4 text-[var(--t-danger)]" /> PDF document (letterhead)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportCsv}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-[var(--t-success)]" /> CSV spreadsheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={printTable} disabled={busy === 'print'}>
          <Printer className="mr-2 h-4 w-4" /> Print (content only)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function cellText(col: ColumnSpec<unknown>, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (col.type === 'money') return fmtMoneyPlain(Number(v));
  if (col.type === 'date') return new Date(String(v)).toLocaleDateString('en-KE');
  if (col.type === 'datetime') return new Date(String(v)).toLocaleString('en-KE');
  if (col.type === 'bool') return v ? 'Yes' : 'No';
  return String(v);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
