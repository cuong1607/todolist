import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Used by requireUser() to sign out deactivated members (Server Components can't write cookies).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  const reason = request.nextUrl.searchParams.get("reason");
  if (reason === "inactive") url.searchParams.set("reason", "inactive");
  return NextResponse.redirect(url);
}
