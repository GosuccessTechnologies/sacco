'use client';
// ============================================================================
// DataTable — DEVELOPER_GUIDE.md §7.3 (all 12 directive points).
// TanStack Table v8 core with DSMS contract: 4 default columns + actions,
// session-scoped visibility, zebra, alternating headers, inset borders,
// row numbers + selector, unique-colored actions, filters, pagination,
// stats strip (dashboards only), export/print with letterhead.
// ============================================================================
import * as React from 'react';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  getPaginationRowModel, flexRender, type ColumnDef, type SortingState, type RowSelectionState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Download, Filter, Printer, RotateCcw, Search, Settings2, Sigma, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmtMoneyPlain, statusBadge, badgeClass, type BadgeTone } from '@/lib/client-utils';
import { ExportButtons } from './export-buttons';
import { usePermission } from '@/hooks/use-permission';

export type FieldType = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'badge' | 'bool' | 'count';
export interface ColumnSpec<T> {
  key: string;
  header: string;
  type?: FieldType;
  defaultVisible?: boolean;
  filter?: 'text' | 'select' | 'range' | 'dateRange';
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  badgeMap?: Record<string, [string, BadgeTone]>;
  hideOnExport?: boolean;
}
export interface ActionSpec<T> {
  label: string; icon: React.ComponentType<{ className?: string }>;
  color: 'view' | 'edit' | 'delete' | 'approve' | 'reject' | 'print' | 'extra' | 'primary';
  onClick: (row: T) => void;
  show?: (row: T) => boolean;
}
export interface DataTableProps<T> {
  id: string;                 // sessionStorage scope (session-only persistence)
  title: string;              // module name used on exports
  subtitle?: string;          // printed under the letterhead
  data: T[];
  columns: ColumnSpec<T>[];
  actions?: ActionSpec<T>[];
  enableSelect?: boolean;
  stats?: boolean;            // dashboard pages only (guide §7.3 #11)
  exportPermission?: string | null;
  searchKeys?: (keyof T & string)[];
  toolbarExtra?: React.ReactNode;
  emptyMessage?: string;
  onRowsChange?: (rows: T[]) => void;
}

type AnyRow = Record<string, unknown>;

export function DataTable<T extends AnyRow>(props: DataTableProps<T>) {
  const { id, title, subtitle, data, columns, actions = [], enableSelect = true, stats = false, searchKeys, toolbarExtra, emptyMessage = 'No records found' } = props;
  const storageKey = `dsms-table-${id}`;

  const [globalSearch, setGlobalSearch] = React.useState('');
  const [columnSearch, setColumnSearch] = React.useState<Record<string, string>>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [showFilters, setShowFilters] = React.useState(false);
  const [visible, setVisible] = React.useState<Record<string, boolean>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch { /* fresh session */ }
    const initial: Record<string, boolean> = {};
    let count = 0;
    for (const c of columns) {
      const vis = c.defaultVisible ?? (count < 4); // exactly 4 data columns by default
      if (vis && c.type !== 'count') count++;
      initial[c.key] = vis;
    }
    return initial;
  });

  React.useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(visible)); } catch { /* quota */ }
  }, [visible, storageKey]);

  const filtered = React.useMemo(() => {
    let rows = data;
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      const keys = searchKeys ?? (columns.map((c) => c.key) as (keyof T & string)[]);
      rows = rows.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    for (const [key, term] of Object.entries(columnSearch)) {
      if (!term) continue;
      const spec = columns.find((c) => c.key === key);
      if (spec?.filter === 'range') {
        const [min, max] = term.split('..').map((x) => parseFloat(x));
        if (!isNaN(min)) rows = rows.filter((r) => Number(r[key] ?? 0) >= min * 100);
        if (!isNaN(max ?? NaN)) rows = rows.filter((r) => Number(r[key] ?? 0) <= max * 100);
      } else if (spec?.filter === 'dateRange') {
        const [from, to] = term.split('..');
        rows = rows.filter((r) => {
          const d = new Date(String(r[key] ?? 0)).getTime();
          return (!from || d >= new Date(from).getTime()) && (!to || d <= new Date(to).getTime() + 86400000);
        });
      } else if (spec?.filter === 'select') {
        const opts = term.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (opts.length) rows = rows.filter((r) => opts.includes(String(r[key] ?? '').toLowerCase()));
      } else {
        const q = term.toLowerCase();
        rows = rows.filter((r) => String(r[key] ?? '').toLowerCase().includes(q));
      }
    }
    return rows;
  }, [data, globalSearch, columnSearch, columns, searchKeys]);

  const selectedRows = React.useMemo(() => filtered.filter((_, i) => selection[i]), [filtered, selection]);
  const exportRows = selectedRows.length ? selectedRows : filtered;

  const tableColumns = React.useMemo<ColumnDef<T>[]>(() => {
    const cols: ColumnDef<T>[] = [];
    if (enableSelect) {
      cols.push({
        id: '__select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} aria-label="Select row" />
        ),
        enableSorting: false,
      });
    }
    cols.push({
      id: '__no',
      header: '#',
      cell: ({ row }) => <span className="tabular-nums text-[var(--t-muted-text)]">{tableStartNo(row.index)}</span>,
      enableSorting: false,
    });
    for (const spec of columns) {
      if (spec.type === 'count') continue;
      cols.push({
        id: spec.key,
        accessorKey: spec.key as any,
        header: spec.header,
        cell: ({ getValue }) => renderCell(spec, getValue() as unknown),
        enableSorting: spec.sortable ?? true,
      });
    }
    if (actions.length) {
      cols.push({
        id: '__actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {actions.map((a) => (a.show?.(row.original) ?? true) && (
              <button key={a.label} type="button" className={`act-btn act-${a.color}`} title={a.label} onClick={() => a.onClick(row.original)}>
                <a.icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{a.label}</span>
              </button>
            ))}
          </div>
        ),
        enableSorting: false,
      });
    }
    return cols;
  }, [columns, actions, enableSelect, visible]);

  const table = useReactTable({
    data: filtered,
    columns: tableColumns,
    state: { sorting, rowSelection: selection, columnVisibility: toVisibility(visible, columns, enableSelect, actions.length > 0) },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    onColumnVisibilityChange: (updater) => {
      setVisible((prev) => {
        const next = typeof updater === 'function' ? (updater as (old: Record<string, boolean>) => Record<string, boolean>)(prev) : updater;
        const merged = { ...prev, ...next };
        return merged;
      });
    },
  });

  const tableStartNo = (idx: number) => table.getState().pagination.pageIndex * table.getState().pagination.pageSize + idx + 1;
  const activeFilterCount = Object.values(columnSearch).filter(Boolean).length + (globalSearch ? 1 : 0);
  const numericCols = columns.filter((c) => c.type === 'money' || c.type === 'number');
  const { can } = usePermission();
  const allowExport = props.exportPermission === undefined ? true : can(props.exportPermission ?? null);

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between no-print">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--t-muted-text)]" />
            <Input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="dsms-input pl-8" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)} className={showFilters ? 'border-[var(--t-primary)]' : ''}>
            <Filter className="mr-1 h-3.5 w-3.5" /> Filters
            {activeFilterCount > 0 && <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge>}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setColumnSearch({}); setGlobalSearch(''); }}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectionCount(table) > 0 && (
            <Badge variant="outline" className="border-[var(--t-primary)]/40 text-[var(--t-primary)]">
              {selectionCount(table)} selected
            </Badge>
          )}
          {toolbarExtra}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Settings2 className="mr-1 h-3.5 w-3.5" /> Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <p className="px-2 pb-1 text-xs font-semibold text-[var(--t-muted-text)]">Visible columns (this session only)</p>
              {columns.filter((c) => c.type !== 'count').map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--t-table-header-a)]">
                  <Checkbox checked={visible[c.key] ?? false} onCheckedChange={(v) => setVisible((p) => ({ ...p, [c.key]: Boolean(v) }))} />
                  {c.header}
                </label>
              ))}
              <div className="mt-1 flex gap-2 border-t pt-2">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setAllVisible(columns, true)}>Expand all</Button>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setAllVisible(columns, false)}>Reset</Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          {allowExport && <ExportButtons title={title} subtitle={subtitle} rows={exportRows as AnyRow[]} columns={columns.filter((c) => c.type !== 'count')} />}
        </div>
      </div>

      {/* column filters row */}
      {showFilters && (
        <div className="grid gap-2 rounded-lg border bg-[var(--t-table-header-a)] p-2 sm:grid-cols-2 lg:grid-cols-4 no-print">
          {columns.filter((c) => c.filter && c.type !== 'count').map((c) => (
            <div key={c.key} className="space-y-1">
              <label className="text-xs font-medium text-[var(--t-muted-text)]">{c.header}</label>
              {c.filter === 'select' ? (
                <Input value={columnSearch[c.key] ?? ''} onChange={(e) => setColumnSearch((p) => ({ ...p, [c.key]: e.target.value }))} placeholder="e.g. ACTIVE, PENDING" className="dsms-input h-9" />
              ) : c.filter === 'range' ? (
                <Input value={columnSearch[c.key] ?? ''} onChange={(e) => setColumnSearch((p) => ({ ...p, [c.key]: e.target.value }))} placeholder="min..max (e.g. 1000..5000)" className="dsms-input h-9" />
              ) : c.filter === 'dateRange' ? (
                <Input value={columnSearch[c.key] ?? ''} onChange={(e) => setColumnSearch((p) => ({ ...p, [c.key]: e.target.value }))} placeholder="2026-01-01..2026-12-31" className="dsms-input h-9" />
              ) : (
                <Input value={columnSearch[c.key] ?? ''} onChange={(e) => setColumnSearch((p) => ({ ...p, [c.key]: e.target.value }))} placeholder={`Filter ${c.header.toLowerCase()}…`} className="dsms-input h-9" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* table */}
      <div className="dsms-table-wrap">
        <table className="dsms-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} style={{ textAlign: (h.column.id === '__actions' || h.column.id === '__no') ? 'center' : undefined }}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button type="button" className="flex items-center gap-1 hover:text-[var(--t-primary)]" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getAllLeafColumns().length} className="px-4 py-10 text-center text-sm text-[var(--t-muted-text)]">
                  <Table2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ textAlign: cell.column.id === '__actions' ? 'center' : cell.column.id === '__no' ? 'center' : (columns.find((c) => `col-${c.key}` === cell.column.id || c.key === cell.column.id)?.align === 'right' ? 'right' : undefined) }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* stats strip — dashboards only */}
      {stats && numericCols.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-[var(--t-surface)] px-4 py-2 text-xs text-[var(--t-muted-text)]">
          <span className="inline-flex items-center gap-1 font-semibold"><Sigma className="h-3.5 w-3.5" /> Totals:</span>
          {numericCols.map((c) => (
            <span key={c.key}>{c.header}: <strong className="text-[var(--t-text)]">{fmtMoneyPlain(filtered.reduce((s, r) => s + Number(r[c.key] ?? 0), 0))}</strong></span>
          ))}
        </div>
      )}

      {/* pagination */}
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row no-print">
        <p className="text-xs text-[var(--t-muted-text)]">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + (table.getRowModel().rows.length ? 1 : 0)}–
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + table.getRowModel().rows.length} of {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <select
            className="dsms-input h-9 w-20 py-1"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Page size"
          >
            {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 text-xs text-[var(--t-muted-text)]">Page {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );

  function setAllVisible(cols: ColumnSpec<T>[], v: boolean) {
    const next: Record<string, boolean> = {};
    for (const c of cols) next[c.key] = v;
    setVisible(next);
  }
}

function selectionCount(table: ReturnType<typeof useReactTable<AnyRow>>) {
  return Object.values(table.getState().rowSelection ?? {}).filter(Boolean).length;
}

function toVisibility(visible: Record<string, boolean>, columns: ColumnSpec<any>[], enableSelect: boolean, hasActions: boolean): Record<string, boolean> {
  const vis: Record<string, boolean> = {};
  if (enableSelect) vis.__select = true;
  vis.__no = true;
  for (const c of columns) vis[c.key] = visible[c.key] ?? false;
  if (hasActions) vis.__actions = true;
  return vis;
}

function renderCell(spec: ColumnSpec<any>, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-[var(--t-muted-text)]">—</span>;
  switch (spec.type) {
    case 'money':
      return <span className="tabular-nums font-medium">{fmtMoneyPlain(Number(value))}</span>;
    case 'number':
      return <span className="tabular-nums">{String(value)}</span>;
    case 'date': {
      const d = new Date(String(value));
      return <span className="whitespace-nowrap">{d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
    }
    case 'datetime': {
      const d = new Date(String(value));
      return <span className="whitespace-nowrap">{d.toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>;
    }
    case 'bool':
      return value ? <Badge className={badgeClass.success}>Yes</Badge> : <Badge className={badgeClass.neutral}>No</Badge>;
    case 'badge': {
      const mapped = spec.badgeMap?.[String(value)] ?? null;
      const sb = mapped ? { label: mapped[0], tone: mapped[1] } : statusBadge(String(value));
      return <Badge className={badgeClass[sb.tone]}>{sb.label}</Badge>;
    }
    default:
      return <span className="line-clamp-2">{String(value)}</span>;
  }
}
