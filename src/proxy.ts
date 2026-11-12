import { NextResponse, type NextRequest } from 'next/server';

/**
 * Guests opening a private area get a real HTTP 307 to the login page BEFORE anything renders.
 * (Pages with a loading.tsx skeleton stream, and a redirect issued while streaming cannot change the HTTP status.)
 * This is only a cookie-presence shortcut; real authentication and authorisation still happen in the pages/actions.
 */
const PRIVATE = /^\/(reservations|profile|owner|admin|notifications|chat|favorites|dashboard|pay)(\/|$)/;
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PRIVATE.test(pathname) || req.cookies.has('hb_session')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login'; url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url, 307);
}
export const config = { matcher: ['/reservations/:path*', '/profile/:path*', '/owner/:path*', '/admin/:path*', '/notifications/:path*', '/chat/:path*', '/favorites/:path*', '/dashboard/:path*', '/pay/:path*'] };
