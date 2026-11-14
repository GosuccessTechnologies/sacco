'use client';
// Permission hooks + <Can> — guide §5.2 (client hiding is cosmetic; API is the boundary)
import type React from 'react';
import { useSession } from 'next-auth/react';
import type { PermissionKey } from '@/lib/constants';

export interface SessionUser {
  id: string; name?: string | null; email?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
  designation?: string | null;
  permissions: PermissionKey[];
  memberId?: string | null;
  actAs?: string | null; actAsBy?: string | null;
}

export function useCurrentUser(): SessionUser | null {
  const { data } = useSession();
  return (data?.user as SessionUser) ?? null;
}

export function usePermission() {
  const user = useCurrentUser();
  return {
    user,
    can(perm: PermissionKey | null): boolean {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      if (!perm) return true;
      return user.permissions?.includes(perm) ?? false;
    },
  };
}

export function Can({ perm, children, fallback = null }: { perm: PermissionKey | null; children: React.ReactNode; fallback?: React.ReactNode }): React.ReactNode {
  const { can } = usePermission();
  return can(perm) ? children : fallback;
}
