import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;
export type Role = Profile["role"];

/**
 * The signed-in user's profile, or null. The user id ALWAYS comes from the
 * verified session (getClaims validates the JWT) — never from request input.
 * Cached per request so layouts and pages can call it freely.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return profile;
});

/** For pages, layouts and Server Functions that need a signed-in, active member. */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/logout?reason=inactive");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "ADMIN") redirect(homePathFor(profile.role));
  return profile;
}

/** Where each role lands after login. */
export function homePathFor(role: Role) {
  return role === "ADMIN" ? "/overview" : "/today";
}
