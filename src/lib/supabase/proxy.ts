import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Routes reachable without a session. The Zalo webhook and the cron worker are called by
 * machines; they authenticate themselves (signature / bearer secret) inside the route.
 */
const PUBLIC_PATHS = ["/login", "/logout", "/robots.txt", "/api/health", "/api/zalo/webhook", "/api/cron"];

function isPublic(pathname: string) {
  // The home page itself is public: signed-out visitors (and Zalo's domain-verification crawler)
  // get the sign-in screen there with a 200, not a redirect.
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase auth session cookie on each request and sends
 * signed-out visitors to /login. This is an optimistic check for UX only —
 * real authorization happens in requireUser()/requireAdmin() and in RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const env = getPublicEnv();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims — it validates and refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims.sub;
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    return redirectKeepingCookies(request, response, "/login");
  }
  if (signedIn && pathname === "/login") {
    return redirectKeepingCookies(request, response, "/");
  }

  return response;
}

/** Redirect while preserving any refreshed auth cookies set on `response`. */
function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
