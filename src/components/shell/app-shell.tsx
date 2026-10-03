import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:pl-sidebar">
      <Sidebar />
      <Header />
      {/* Bottom padding keeps content clear of the mobile bottom nav. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-gutter pt-5 pb-[calc(var(--bottomnav-height)+env(safe-area-inset-bottom)+1.5rem)] md:px-8 md:pt-8 md:pb-10">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
