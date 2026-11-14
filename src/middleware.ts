// Route protection — DEVELOPER_GUIDE.md §5.1/§5.2 (defense in depth; layouts re-check).
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/apply', '/apply/success', '/contact', '/subscribe', '/sitemap.xml', '/robots.txt', '/manifest.member.webmanifest', '/sw-member.js'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p) || pathname.startsWith('/api/auth') || pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/public') || pathname.startsWith('/_next') || pathname.startsWith('/api/files') || pathname.startsWith('/images') || pathname.startsWith('/uploads')) {
    return NextResponse.next();
  }
  // everything else requires a session cookie — actual validation happens in layouts/API
  const hasSession = req.cookies.has('authjs.session-token') || req.cookies.has('next-auth.session-token');
  const isApi = pathname.startsWith('/api');
  if (!hasSession && (pathname.startsWith('/admin') || pathname.startsWith('/dashboard'))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (!hasSession && isApi && !pathname.startsWith('/api/cron')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
