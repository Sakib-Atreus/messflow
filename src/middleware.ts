import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intl = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intl(request);
  return updateSession(request, response);
}

export const config = {
  // skip api, auth callback, Next internals, and files with an extension (icons, sw.js, manifest)
  matcher: ["/((?!api|auth|_next|_vercel|icons|.*\\..*).*)"],
};
