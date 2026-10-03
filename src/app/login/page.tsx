import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason } = await searchParams;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-gutter py-12">
      <ThemeToggle className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3" />

      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised">
            <CalendarCheck className="size-7" />
          </div>
          <h1 className="text-display">Team Todo</h1>
          <p className="text-muted-foreground">Đăng nhập để xem việc hôm nay.</p>
        </div>

        <LoginForm notice={reason === "inactive" ? "Tài khoản đã bị khoá. Liên hệ admin." : undefined} />

        <p className="text-center text-caption text-muted-foreground">Chưa có tài khoản? Liên hệ admin của team.</p>
      </div>
    </main>
  );
}
