// ============================================================================
// Audit engine — DEVELOPER_GUIDE.md §5.3. Append-only.
// ============================================================================
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export interface AuditInput {
  userId?: string | null;
  userRole?: string | null;
  action: string;          // e.g. MEMBER_CREATE
  module: string;          // e.g. members
  entity: string;          // table name
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  severity?: 'info' | 'warn' | 'critical';
}

/** Append an audit record. Never throws into the caller's flow. */
export async function audit(input: AuditInput, tx?: Prisma.TransactionClient) {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    const userAgent = h.get('user-agent');
    const client = tx ?? db;
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userRole: input.userRole ?? null,
        action: input.action,
        module: input.module,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: (input.before ?? undefined) as any,
        after: (input.after ?? undefined) as any,
        ip,
        userAgent,
        severity: input.severity ?? 'info',
      },
    });
  } catch (e) {
    console.error('[audit] failed:', (e as Error).message);
  }
}
