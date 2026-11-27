import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Refreshes the auth session cookie on the given response. getClaims() only calls Supabase when the
 *  token has expired and needs a refresh; otherwise the signature is checked locally (fast). */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}
