import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl, getAuth0 } from "./lib/auth0";

export async function proxy(request: NextRequest) {
  const auth = getAuth0();
  if (!auth) {
    if (request.nextUrl.pathname.startsWith("/auth/"))
      return NextResponse.redirect(new URL("/?setup=auth", request.url));
    return NextResponse.next();
  }
  if (["/auth/login", "/auth/logout", "/api/todoist/connect"].includes(request.nextUrl.pathname)) {
    const destination = new URL(getAppBaseUrl());
    // NextURL normalizes loopback hosts to localhost; headers preserve the browser's host.
    const host =
      (request.headers.get("x-forwarded-host") || request.headers.get("host"))
        ?.split(",")[0]
        .trim() || request.nextUrl.host;
    const protocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
      request.nextUrl.protocol.slice(0, -1);
    if (`${protocol}://${host}`.toLowerCase() !== destination.origin) {
      destination.pathname = request.nextUrl.pathname;
      destination.search = request.nextUrl.search;
      const response = NextResponse.redirect(destination);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }
  return auth.middleware(request);
}
export const config = {
  // Image GETs authenticate in their route; rolling cookies here would disable caching.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|icon.svg|api/backgrounds/).*)"],
};
