import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSelector } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/shell/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { NotificationForm } from "./notification-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Tài khoản" };

export default async function ProfilePage() {
  const me = await requireUser();
  const name = me.full_name || me.email;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("daily_summary_enabled, daily_summary_time, deadline_reminder_enabled, remind_before_minutes, overdue_alert_enabled, end_of_day_summary_enabled")
    .eq("user_id", me.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Tài khoản" />

      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <UserAvatar name={name} src={me.avatar_url} size="lg" className="size-14" />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-title">{name}</p>
                <p className="truncate text-caption text-muted-foreground">{me.email}</p>
                <RoleBadge role={me.role} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thông tin cá nhân</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm fullName={me.full_name} notificationEnabled={me.notification_enabled} />
            </CardContent>
          </Card>

          {settings && (
            <Card>
              <CardHeader>
                <CardTitle>Thông báo</CardTitle>
                <CardDescription>
                  Chọn loại nhắc việc bạn muốn nhận. Thông báo hiện ở{" "}
                  <Link href="/notifications" className="font-medium text-primary hover:underline">
                    mục Thông báo
                  </Link>
                  ; sẽ gửi thêm qua Zalo khi kết nối xong.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationForm settings={settings} masterEnabled={me.notification_enabled} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Zalo</CardTitle>
              <CardDescription>Nhận nhắc việc qua Zalo.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <MessageCircle className="size-5" />
              </span>
              {me.zalo_connected ? (
                <Badge className="bg-success-soft text-success-soft-foreground">Đã kết nối</Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground">Chưa kết nối · Sắp có</Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Giao diện</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemeSelector />
            </CardContent>
          </Card>

          <form action={logout}>
            <Button type="submit" variant="destructive" size="lg" className="h-11 w-full">
              <LogOut />
              Đăng xuất
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
