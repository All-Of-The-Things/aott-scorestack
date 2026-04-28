// Edge-safe middleware: no Prisma, no pg, no Node crypto.
//
// The core scoring pipeline (upload → enrich → score → view results) is
// intentionally public — no session required. Auth is only enforced for
// persistent/paid features: settings, billing, org management, messages,
// delivery, and saving models.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require an active session. Everything else is public.
const PROTECTED_PREFIXES = [
  "/runs",
  "/settings",
  "/delivery",
  "/onboarding",
  "/api/billing",
  "/api/org",
  "/api/messages",
  "/api/delivery",
];

// POST /api/models requires auth (saving); GET is allowed for anonymous users
// so the saved models panel can render (returns empty list without a session).
function isProtected(pathname: string, method: string): boolean {
  if (pathname === "/api/models" && method !== "GET") return true;
  // /api/runs (listing) is protected; /api/runs/[id]/status is public
  if (pathname === "/api/runs") return true;
  if (pathname.startsWith("/api/runs/") && pathname.endsWith("/export"))
    return true;
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname, request.method)) return NextResponse.next();

  // NextAuth v5 uses "authjs.*" cookie names; v4 used "next-auth.*".
  // Check both so local dev and production both work regardless of version drift.
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value ??
    request.cookies.get("next-auth.session-token")?.value ??
    request.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
