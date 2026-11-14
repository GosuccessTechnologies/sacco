// ============================================================================
// RBAC resolver — DEVELOPER_GUIDE.md §5.2, §6
// Server-only. Snapshot computed at login and carried in the JWT.
// ============================================================================
import { db } from '@/lib/db';
import {
  DESIGNATION_PERMISSIONS, MEMBER_PERMISSIONS, PERMISSIONS,
  type Designation, type PermissionKey,
} from '@/lib/constants';

export interface PermissionSnapshot {
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
  designation?: string | null;
  permissions: PermissionKey[];
}

export function allPermissionKeys(): PermissionKey[] {
  return Object.keys(PERMISSIONS) as PermissionKey[];
}

/** Compute the permission snapshot for a logging-in user (DB matrix wins over constants). */
export async function computeSnapshot(
  role: string,
  designation: string | null,
  overridesJson: unknown,
): Promise<PermissionSnapshot> {
  if (role === 'SUPER_ADMIN') {
    return { role: 'SUPER_ADMIN', designation, permissions: allPermissionKeys() };
  }
  if (role === 'MEMBER') {
    return { role: 'MEMBER', designation: null, permissions: [...MEMBER_PERMISSIONS] };
  }
  // ADMIN: DB-edited matrix for the designation (falls back to seeded constants)
  let base: PermissionKey[] = [];
  if (designation) {
    const rows = await db.permissionAssignment.findMany({ where: { designation } });
    if (rows.length) base = rows.map((r) => r.permissionKey as PermissionKey);
    else base = [...(DESIGNATION_PERMISSIONS[designation as Designation] ?? [])];
  }
  const set = new Set<PermissionKey>(base);
  const overrides = Array.isArray(overridesJson) ? (overridesJson as string[]) : [];
  for (const o of overrides) {
    if (o.startsWith('+') && o.slice(1) in PERMISSIONS) set.add(o.slice(1) as PermissionKey);
    if (o.startsWith('-')) set.delete(o.slice(1) as PermissionKey);
  }
  return { role: 'ADMIN', designation, permissions: [...set] };
}
