import { redirect } from "next/navigation";
import { getCurrentProfile, homePathFor } from "@/lib/auth";
import { LoginScreen } from "./login/login-screen";

/**
 * Signed in → the role's home. Signed out → the sign-in screen, rendered right here (HTTP 200)
 * instead of redirecting to /login: Zalo verifies the domain by reading a meta tag on the home
 * page, and a crawler that gets a redirect may never see it.
 */
export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) return <LoginScreen />;
  if (!profile.active) redirect("/logout?reason=inactive");
  redirect(homePathFor(profile.role));
}
