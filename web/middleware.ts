import { NextResponse, type NextRequest } from "next/server";

// Gate the admin section on cookie *presence*. Real validity is enforced by
// the API on each call; the layout will redirect to /login on the first 401.
// This middleware only spares users a flash of admin chrome when they're not
// signed in at all.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/properties") ||
    pathname.startsWith("/sessions") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/account");
  if (!protectedRoute) return NextResponse.next();

  const hasCookie = req.cookies.has("pgr_admin");
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/properties/:path*",
    "/sessions/:path*",
    "/users/:path*",
    "/account/:path*",
  ],
};
