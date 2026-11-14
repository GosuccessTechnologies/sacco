'use client';
// ============================================================================
// FormModal + FormEngine — DEVELOPER_GUIDE.md §7.4.
// Hero header (icon + title + blinking red ×), numbered sections / stepper,
// field icons, inset premium inputs, hero footer (description + actions),
// CSV import alternative (template download → fill → upload).
// ============================================================================
import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { X, Upload, Download, FileSpreadsheet, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { LucideIcon } from 'lucide-react';

export type FieldType = 'text' | 'textarea' | 'money' | 'number' | 'date' | 'select' | 'multiselect' | 'switch' | 'phone' | 'email' | 'id' | 'file' | 'image' | 'richtext' | 'password' | 'time';

export interface FieldDef {
  name: string;
  label: string;
  icon?: LucideIcon;
  type?: FieldType;
  options?: { value: string; label: string }[];
  colSpan?: 1 | 2 | 3 | 4 | 6 | 12;
  required?: boolean;
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  readOnly?: boolean;
  defaultValue?: unknown;
  /** CSV import: this column is parsed as money "1,250.50" */
  money?: boolean;
}
export interface SectionDef {
  title: string;
  icon?: LucideIcon;
  description?: string;
  fields: FieldDef[];
  cols?: 1 | 2 | 3 | 4;
}
export interface FormSchema {
  sections: SectionDef[];
  stepper?: boolean;
}

type Values = Record<string, unknown>;

export interface FormModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  icon: LucideIcon;
  title: string;
  subtitle?: string;           // hero footer description (left)
  submitLabel?: string;        // primary (right)
  secondaryLabel?: string;     // secondary (right, outline)
  onSecondary?: () => void;
  schema: FormSchema;
  initial?: Values;
  onSubmit: (values: Values) => Promise<void> | void;
  submitDisabled?: boolean;
  extraFooter?: React.ReactNode;
  width?: string;
  /** Render-prop form: receives live values + setValue. Plain ReactNode children are rendered after the schema sections. */
  children?: ((ctx: { values: Values; setValue: (k: string, v: unknown) => void }) => React.ReactNode) | React.ReactNode;
}

export function FormModal(props: FormModalProps) {
  const { open, onOpenChange, icon: Icon, title, subtitle, schema } = props;
  const [values, setValues] = React.useState<Values>(() => initValues(props.schema, props.initial));
  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [importMode, setImportMode] = React.useState(false);
  const [importRows, setImportRows] = React.useState<Values[]>([]);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setValues(initValues(props.schema, props.initial));
      setErrors({});
      setStep(0);
      setImportMode(false);
      setImportRows([]);
      setImportErrors([]);
    }
  }, [open, props.initial]);

  const flatFields = schema.sections.flatMap((s) => s.fields);
  const setValue = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  function validateSection(section: SectionDef): boolean {
    const errs: Record<string, string> = {};
    for (const f of section.fields) {
      const v = values[f.name];
      if (f.required && (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length))) errs[f.name] = `${f.label} is required`;
      if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v))) errs[f.name] = 'Invalid email';
      if (f.type === 'phone' && v && !/^\+?[0-9\s-]{9,15}$/.test(String(v))) errs[f.name] = 'Invalid phone';
      if (f.type === 'id' && v && !/^[0-9]{6,12}$/.test(String(v))) errs[f.name] = 'Invalid ID number';
      if ((f.type === 'money' || f.type === 'number') && v !== '' && v !== null && isNaN(Number(String(v).replace(/,/g, '')))) errs[f.name] = 'Invalid number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    // validate every section
    for (const s of schema.sections) {
      if (!validateSection(s)) {
        const idx = schema.sections.indexOf(s);
        if (schema.stepper) setStep(idx);
        toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
        return;
      }
    }
    setPending(true);
    try {
      await props.onSubmit(normalizeValues(schema, values));
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' });
    } finally { setPending(false); }
  }

  // ------------------------------------------------------------ CSV import
  async function downloadTemplate() {
    const headers = flatFields.map((f) => f.label);
    const example = flatFields.map((f) => {
      if (f.options?.length) return f.options[0].value;
      if (f.type === 'money') return '50000.00';
      if (f.type === 'number') return '10';
      if (f.type === 'date') return '1990-01-31';
      if (f.type === 'email') return 'example@divinesacco.co.ke';
      if (f.type === 'phone') return '+254700000000';
      if (f.type === 'switch') return 'true';
      if (f.type === 'select') return (f.options?.[0]?.value ?? '');
      return f.name === 'password' ? 'Divine@2026' : 'Example ' + f.label;
    });
    const csv = '\uFEFF' + [headers.join(','), example.map((x) => `"${x}"`).join(',')].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: 'Template downloaded', description: 'Fill one row per record, then upload it here.' });
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setImportErrors(['File has no data rows']); return; }
      const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const labelToField = new Map(flatFields.map((f) => [f.label.toLowerCase(), f]));
      const rows: Values[] = [];
      const errs: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]);
        const row: Values = {};
        let ok = true;
        headers.forEach((h, ci) => {
          const f = labelToField.get(h);
          if (!f) return;
          let v: unknown = cells[ci]?.trim() ?? '';
          if (f.type === 'switch') v = String(v).toLowerCase() === 'true';
          if (f.type === 'money') v = String(v).replace(/[,\s]/g, '');
          if (f.type === 'number') v = Number(v);
          if (f.type === 'multiselect') v = String(v).split(';').map((s) => s.trim()).filter(Boolean);
          if (f.required && (v === '' || v === null || v === undefined)) { errs.push(`Row ${i}: "${f.label}" is required`); ok = false; }
          row[f.name] = v;
        });
        if (ok) rows.push(row);
      }
      setImportRows(rows);
      setImportErrors(errs);
    };
    reader.readAsText(file);
  }

  async function submitImport() {
    if (!importRows.length) return;
    setPending(true);
    let done = 0; const errs: string[] = [];
    try {
      for (const row of importRows) {
        try { await props.onSubmit(normalizeValues(schema, row)); done++; }
        catch (e) { errs.push((e as Error).message); }
      }
      toast({
        title: `Import finished — ${done} created`,
        description: errs.length ? `${errs.length} failed: ${errs[0]}` : undefined,
        variant: errs.length ? 'destructive' : 'default',
      });
      if (done > 0) onOpenChange(false);
    } finally { setPending(false); }
  }

  const sections = schema.sections;
  const childrenIsRenderProp = typeof props.children === 'function';
  const visibleSections = childrenIsRenderProp ? [sections[0]] : sections;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${props.width ?? 'max-w-2xl'} p-0 overflow-hidden gap-0`} style={{ width: 'min(92vw, 896px)' }}>
        {/* HERO HEADER */}
        <div className="card-hero flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold leading-tight">{title}</h2>
              {props.subtitle && <p className="mt-0.5 text-xs opacity-90">{props.subtitle}</p>}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="blink-close grid h-8 w-8 shrink-0 place-items-center rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* mode switch: manual entry | CSV import */}
        <div className="flex items-center justify-between border-b bg-[var(--t-table-header-a)] px-5 py-2 no-print">
          <div className="flex gap-1 text-xs font-semibold">
            <button type="button" className={`rounded-md px-3 py-1.5 ${!importMode ? 'bg-[var(--t-surface)] text-[var(--t-primary)] shadow-sm' : 'text-[var(--t-muted-text)]'}`} onClick={() => setImportMode(false)}>
              Direct entry
            </button>
            <button type="button" className={`rounded-md px-3 py-1.5 ${importMode ? 'bg-[var(--t-surface)] text-[var(--t-primary)] shadow-sm' : 'text-[var(--t-muted-text)]'}`} onClick={() => setImportMode(true)}>
              Import CSV
            </button>
          </div>
          {schema.stepper && !importMode && (
            <div className="flex items-center gap-1 text-xs text-[var(--t-muted-text)]">
              {sections.map((s, i) => (
                <span key={s.title} className={`rounded-full px-2 py-0.5 ${i === step ? 'bg-[var(--t-primary)] text-white' : i < step ? 'text-[var(--t-success)]' : ''}`}>
                  {i < step ? '✓' : `${i + 1}`} {s.title}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {importMode ? (
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--t-muted-text)]">
                <li>Download the CSV template pre-filled with this form's columns.</li>
                <li>Fill one row per record (keep the header row).</li>
                <li>Upload it here — we validate every row and report errors before creating anything.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1 h-4 w-4" /> Download CSV template</Button>
                <label className="inline-flex">
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} id="csv-import-input" />
                  <Button type="button" size="sm" variant="secondary" onClick={() => document.getElementById('csv-import-input')?.click()}><Upload className="mr-1 h-4 w-4" /> Upload filled CSV</Button>
                </label>
              </div>
              {importRows.length > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-[var(--t-success)]" />
                  <AlertDescription>
                    {importRows.length} valid rows parsed{importErrors.length ? ` · ${importErrors.length} row problems (they will be skipped)` : ''}. First row preview: {Object.entries(importRows[0]).slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join(', ')}…
                  </AlertDescription>
                </Alert>
              )}
              {importErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc pl-4 text-xs">{importErrors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : childrenIsRenderProp ? (
            (props.children as (ctx: { values: Values; setValue: (k: string, v: unknown) => void }) => React.ReactNode)({ values, setValue })
          ) : (
            <>
              {(schema.stepper ? [sections[step]] : visibleSections).map((section, si) => (
                <fieldset key={section.title} className="mb-5 last:mb-1">
                  <legend className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--t-primary)]">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--t-primary)] text-[11px] font-bold text-white">{schema.stepper ? step + 1 : si + 1}</span>
                    {section.icon && <section.icon className="h-4 w-4" />}
                    {section.title}
                  </legend>
                  {section.description && <p className="-mt-2 mb-3 text-xs text-[var(--t-muted-text)]">{section.description}</p>}
                  <div className={`grid grid-cols-1 gap-x-4 gap-y-3 ${section.cols === 1 ? '' : 'sm:grid-cols-2'} ${section.cols === 4 ? 'lg:grid-cols-4' : ''} ${section.cols === 3 ? 'lg:grid-cols-3' : ''}`}>
                    {section.fields.map((f) => (
                      <FieldRenderer key={f.name} f={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => setValue(f.name, v)} colSpanClass={spanClass(f.colSpan)} />
                    ))}
                  </div>
                </fieldset>
              ))}
              {schema.stepper && (
                <div className="flex items-center justify-between">
                  <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                  <Progress value={((step + 1) / sections.length) * 100} className="h-1.5 w-40" />
                  {step < sections.length - 1 ? (
                    <Button type="button" size="sm" className="bg-[var(--t-primary)] text-white hover:brightness-110" onClick={() => validateSection(sections[step]) && setStep((s) => s + 1)}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )}
              {props.children /* plain ReactNode content rendered below the sections */}
            </>
          )}
        </div>

        {/* HERO FOOTER */}
        <div className="flex items-center justify-between gap-3 border-t bg-[var(--t-surface)] px-5 py-3">
          <p className="hidden max-w-md text-xs text-[var(--t-muted-text)] sm:block">
            <FileSpreadsheet className="mr-1 inline h-3 w-3" />
            {subtitle ?? `Completing this ${title.toLowerCase()} records it in the system ledger with a full audit entry.`}
          </p>
          <div className="flex items-center gap-2">
            {props.extraFooter}
            {props.onSecondary && (
              <Button type="button" variant="outline" onClick={props.onSecondary} disabled={pending}>{props.secondaryLabel ?? 'Secondary'}</Button>
            )}
            {importMode ? (
              <Button type="button" onClick={submitImport} disabled={pending || importRows.length === 0} className="bg-[var(--t-primary)] text-white hover:brightness-110">
                {pending ? 'Importing…' : `Import ${importRows.length || ''} rows`}
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={pending || props.submitDisabled} className="bg-[var(--t-primary)] text-white hover:brightness-110">
                {pending ? 'Saving…' : props.submitLabel ?? 'Submit'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ field renderer
function FieldRenderer({ f, value, error, onChange, colSpanClass }: { f: FieldDef; value: unknown; error?: string; onChange: (v: unknown) => void; colSpanClass: string }) {
  const id = `fld-${f.name}`;
  return (
    <div className={colSpanClass} style={{ gridColumn: f.colSpan === 12 ? '1 / -1' : undefined }}>
      <Label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--t-text)]">
        {f.icon && <f.icon className="h-3.5 w-3.5 text-[var(--t-primary)]" />}
        {f.label}
        {f.required && <span className="text-[var(--t-danger)]">*</span>}
      </Label>
      {f.type === 'textarea' ? (
        <Textarea id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} readOnly={f.readOnly} className="dsms-textarea min-h-20" aria-invalid={Boolean(error)} />
      ) : f.type === 'select' ? (
        <Select value={String(value ?? '')} onValueChange={(v) => onChange(v)} disabled={f.readOnly}>
          <SelectTrigger id={id} className="dsms-select-trigger h-10" aria-invalid={Boolean(error)}>
            <SelectValue placeholder={f.placeholder ?? 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : f.type === 'multiselect' ? (
        <div className="flex flex-wrap gap-2 rounded-lg border bg-[var(--t-surface)] p-2" style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.16)' }}>
          {(f.options ?? []).map((o) => {
            const list = Array.isArray(value) ? (value as string[]) : [];
            const on = list.includes(o.value);
            return (
              <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Checkbox checked={on} onCheckedChange={(v) => onChange(v ? [...list, o.value] : list.filter((x) => x !== o.value))} />
                {o.label}
              </label>
            );
          })}
        </div>
      ) : f.type === 'switch' ? (
        <label className="flex h-10 items-center gap-2 rounded-lg border bg-[var(--t-surface)] px-3" style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,.16)' }}>
          <Checkbox checked={Boolean(value)} onCheckedChange={(v) => onChange(Boolean(v))} id={id} />
          <span className="text-sm text-[var(--t-muted-text)]">{value ? 'Yes' : 'No'}</span>
        </label>
      ) : (
        <Input
          id={id}
          type={f.type === 'money' || f.type === 'number' ? 'text' : f.type === 'password' ? 'password' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
          inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(f.type === 'money' ? e.target.value.replace(/[^0-9.,]/g, '') : e.target.value)}
          placeholder={f.placeholder ?? (f.type === 'money' ? '0.00' : undefined)}
          readOnly={f.readOnly}
          className="dsms-input h-10"
          aria-invalid={Boolean(error)}
        />
      )}
      {f.help && !error && <p className="mt-1 text-[11px] text-[var(--t-muted-text)]">{f.help}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-[var(--t-danger)]">{error}</p>}
    </div>
  );
}

function spanClass(col?: 1 | 2 | 3 | 4 | 6 | 12): string {
  switch (col) {
    case 2: return 'sm:col-span-2';
    case 3: return 'sm:col-span-2 lg:col-span-3';
    case 4: return 'sm:col-span-2 lg:col-span-4';
    case 6: return 'sm:col-span-2 lg:col-span-6';
    case 12: return 'sm:col-span-2 lg:col-span-12';
    default: return '';
  }
}

function initValues(schema: FormSchema, initial?: Values): Values {
  const v: Values = {};
  for (const s of schema.sections) {
    for (const f of s.fields) {
      v[f.name] = initial?.[f.name] ?? f.defaultValue ?? (f.type === 'switch' ? false : f.type === 'multiselect' ? [] : '');
    }
  }
  return v;
}

function normalizeValues(schema: FormSchema, raw: Values): Values {
  const out: Values = { ...raw };
  for (const s of schema.sections) {
    for (const f of s.fields) {
      if (f.type === 'money') {
        const str = String(raw[f.name] ?? '').replace(/[,\sKES]/gi, '');
        out[f.name] = str === '' ? null : Math.round(parseFloat(str) * 100);
      }
      if (f.type === 'number') {
        out[f.name] = raw[f.name] === '' || raw[f.name] === null ? null : Number(raw[f.name]);
      }
    }
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim().replace(/^"|"$/g, ''));
}
