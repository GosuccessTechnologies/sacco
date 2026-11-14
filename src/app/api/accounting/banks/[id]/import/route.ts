// Import bank statement CSV → BankStatementLine batch (guide §13.2.5).
import { withPermission, ok, err, body } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

const schema = z.object({
  csv: z.string().min(10),
  mapping: z.object({ date: z.string(), valueDate: z.string().optional(), description: z.string(), ref: z.string().optional(), amount: z.string() }),
});

function parseRows(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export const POST = withPermission('accounting_reconcile', async ({ req, params, session }) => {
  const { id } = params;
  const d = await body(req, schema);
  const bank = await db.bankAccount.findUnique({ where: { id } });
  if (!bank) return err('Bank not found', 404);
  const rows = parseRows(d.csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return err('CSV has no data rows', 400);
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name.toLowerCase());
  const iDate = col(d.mapping.date);
  const iDesc = col(d.mapping.description);
  const iAmount = col(d.mapping.amount);
  const iValue = d.mapping.valueDate ? col(d.mapping.valueDate) : -1;
  const iRef = d.mapping.ref ? col(d.mapping.ref) : -1;
  if (iDate < 0 || iDesc < 0 || iAmount < 0) return err('Mapping columns not found in CSV header', 422);

  const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  let imported = 0; let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawAmount = (r[iAmount] ?? '').replace(/[,\sKES]/gi, '');
    const amount = Number(rawAmount);
    if (!amount || isNaN(amount)) { skipped++; continue; }
    const dateStr = r[iDate]?.trim();
    const statementDate = new Date(dateStr);
    if (isNaN(statementDate.getTime())) { skipped++; continue; }
    const valueDate = iValue >= 0 && r[iValue] ? new Date(r[iValue]) : statementDate;
    const ref = iRef >= 0 ? (r[iRef] ?? null) : null;
    // duplicate detection
    const dup = await db.bankStatementLine.findFirst({
      where: { bankAccountId: id, statementDate, amountCents: Math.round(amount * 100), ref: ref ?? undefined },
    });
    if (dup) { skipped++; continue; }
    await db.bankStatementLine.create({
      data: {
        bankAccountId: id, batchId, statementDate, valueDate,
        description: (r[iDesc] ?? '').slice(0, 200), ref,
        amountCents: Math.round(amount * 100),
      },
    });
    imported++;
  }
  await audit({ userId: session.user.id, userRole: session.user.role, action: 'BANK_IMPORT', module: 'accounting', entity: 'BankStatementLine', entityId: batchId, after: { imported, skipped }, severity: 'info' });
  return ok({ batchId, imported, skipped });
});
