import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";
import { getTeamName } from "@/lib/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();
  const teamName = await getTeamName();

  return (
    <AppShell
      user={{
        fullName: profile.full_name || profile.email,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        role: profile.role,
        teamName,
      }}
    >
      {children}
    </AppShell>
  );
}
