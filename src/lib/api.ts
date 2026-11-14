// ============================================================================
// API helpers — DEVELOPER_GUIDE.md §2.1, §5.2
// Single wrapper: session → permission → actAs mutation guard → zod → handler.
// ============================================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import type { PermissionKey } from '@/lib/constants';
import type { Session } from 'next-auth';

export type ApiSession = NonNullable<Awaited<ReturnType<typeof auth>>>['user'];

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function currentSession(): Promise<Session | null> {
  return await auth();
}

export interface AuthedContext {
  session: Session;
  isImpersonating: boolean;
}

async function guard(perm: PermissionKey | null, needWrite: boolean) {
  const session = await auth();
  if (!session?.user) return { error: err('Authentication required', 401) } as const;
  const u = session.user;
  if (u.status !== undefined) { /* future use */ }
  // member self-service kill-switch for member sessions
  if (u.role === 'MEMBER' && needWrite) {
    const { getSettings } = await import('@/lib/settings');
    const features = await getSettings('features');
    if (features?.memberSelfService === false) return { error: err('Member self-service is currently disabled', 403) } as const;
  }
  if (perm && u.role !== 'SUPER_ADMIN' && !u.permissions?.includes(perm)) {
    return { error: err('You do not have permission to perform this action', 403) } as const;
  }
  // impersonation: view-only
  if (u.actAs && needWrite) {
    return { error: err('Impersonation is view-only — exit impersonation to make changes', 403) } as const;
  }
  return { session, isImpersonating: Boolean(u.actAs) } as const;
}

/** Same-origin check for mutating requests (CSRF defense-in-depth).
 *  Accepts the request when the Origin host matches ANY of:
 *  - the Host header (direct access),
 *  - X-Forwarded-Host (reverse proxy / preview deployments, first value of comma list),
 *  - NEXT_PUBLIC_APP_URL (canonical deployment URL).
 *  Default ports (:80/:443) and case are normalized before comparing. */
async function originOk() {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return true; // non-browser clients / server-to-server with secret
  let originHost: string;
  try { originHost = new URL(origin).host.toLowerCase(); } catch { return false; }
  const candidates = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (!v) return;
    v.split(',').forEach((piece) => {
      const host = piece.trim().toLowerCase();
      if (host) candidates.add(host);
    });
  };
  add(h.get('host'));
  add(h.get('x-forwarded-host'));
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try { add(new URL(process.env.NEXT_PUBLIC_APP_URL).host); } catch { /* malformed env */ }
  }
  const stripDefaultPort = (host: string) => host.replace(/:(80|443)$/, '');
  const bareOrigin = stripDefaultPort(originHost);
  for (const c of candidates) {
    if (c === originHost || stripDefaultPort(c) === bareOrigin) return true;
  }
  return false;
}

type Handler = (ctx: { session: Session; req: Request; params: Record<string, string> }) => Promise<Response>;

function route(handler: Handler, req: Request, params: Record<string, string>) {
  return handler({ session: null as unknown as Session, req, params }).catch((e) => {
    if (e instanceof z.ZodError) {
      return err('Validation failed', 422, { issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
    }
    console.error('[api]', req.method, req.url, (e as Error));
    const msg = (e as Error)?.message ?? 'Unexpected error';
    if (/Permission|permission/.test(msg)) return err(msg, 403);
    return err(process.env.NODE_ENV === 'development' ? msg : 'Unexpected error', 500);
  });
}

/** GET wrapper (read). */
export function withAuth(perm: PermissionKey | null, handler: Handler) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => {
    const g = await guard(perm, false);
    if ('error' in g) return g.error;
    const params = (await ctx?.params) ?? {};
    return route((c) => handler({ ...c, session: g.session }), req, params);
  };
}

/** Mutation wrapper (write). */
export function withPermission(perm: PermissionKey | null, handler: Handler) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => {
    if (!(await originOk())) return err('Cross-origin mutation blocked', 403);
    const g = await guard(perm, true);
    if ('error' in g) return g.error;
    const params = (await ctx?.params) ?? {};
    return route((c) => handler({ ...c, session: g.session }), req, params);
  };
}

/** Parse JSON body with a zod schema. */
export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new z.ZodError([]); }
  return schema.parse(json) as z.infer<S>;
}

/** Query params → plain object (single values). */
export function query(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const out: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { if (v !== '') out[k] = v; });
  return out;
}

// ------------------------------------------------------------ simple rate limiter
const buckets = new Map<string, { n: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { n: 1, resetAt: now + windowMs }); return true; }
  b.n += 1;
  return b.n <= max;
}
