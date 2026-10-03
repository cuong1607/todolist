import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Palette } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeSelector } from "@/components/theme-toggle";
import { checkSupabaseHealth, type SupabaseHealth } from "@/lib/supabase/health";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const health = await checkSupabaseHealth();

  return (
    <>
      <PageHeader title="Cài đặt" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Giao diện</CardTitle>
            <CardDescription>Chọn chế độ sáng, tối hoặc theo hệ thống.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSelector />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kết nối Supabase</CardTitle>
            <CardDescription>Trạng thái cơ sở dữ liệu.</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthStatus health={health} />
          </CardContent>
        </Card>

        <Link
          href="/design"
          className="flex items-center gap-3 rounded-xl border bg-surface p-4 shadow-card outline-none transition-colors duration-(--duration-normal) hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:col-span-2"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <Palette className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">Design System</span>
            <span className="block text-caption text-muted-foreground">Màu, chữ, bóng, bo góc, animation</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      </div>
    </>
  );
}

function HealthStatus({ health }: { health: SupabaseHealth }) {
  switch (health.status) {
    case "ok":
      return (
        <div className="space-y-2">
          <Badge className="bg-success-soft text-success-soft-foreground">Đã kết nối · {health.latencyMs}ms</Badge>
          <p className="text-caption text-muted-foreground">
            Schema: <code className="font-mono">{health.schemaVersion}</code>
          </p>
        </div>
      );
    case "not_configured":
      return (
        <div className="space-y-2">
          <Badge className="bg-warning-soft text-warning-soft-foreground">Chưa cấu hình</Badge>
          <p className="text-caption text-muted-foreground">
            Điền <code className="font-mono">.env.local</code> theo <code className="font-mono">.env.example</code>.
          </p>
        </div>
      );
    case "error":
      return (
        <div className="space-y-2">
          <Badge className="bg-danger-soft text-danger-soft-foreground">Lỗi kết nối</Badge>
          <p className="text-caption break-words text-muted-foreground">{health.message}</p>
        </div>
      );
  }
}
