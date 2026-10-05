import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/shell/user-avatar";
import { requireAdmin } from "@/lib/auth";
import { NOTIFICATION_STATUS_LABELS, NOTIFICATION_TYPE_LABELS } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { formatDay, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getZaloConfig, missingZaloEnv, zaloPaths } from "@/lib/zalo/config";
import { CopyField, DisconnectButton, TestMessageForm, UnlinkMemberButton, ZaloEnabledSwitch } from "./zalo-controls";

export const metadata: Metadata = { title: "Zalo OA" };

const statusSchema = z.object({
  connected: z.boolean(),
  access_token_expires_at: z.string().nullable(),
  dispatch_configured: z.boolean(),
});

const CONNECT_ERRORS: Record<string, string> = {
  not_configured: "Máy chủ chưa có đủ biến môi trường Zalo.",
  state: "Phiên kết nối không hợp lệ hoặc đã hết hạn. Hãy bấm kết nối lại.",
  denied: "Zalo không trả về mã uỷ quyền — có thể bạn đã từ chối cấp quyền.",
  exchange: "Zalo từ chối đổi mã uỷ quyền. Kiểm tra App ID / App Secret rồi thử lại.",
};

const when = (iso: string) => `${formatDay(localDateOf(iso))} · ${formatTimeLocal(iso)}`;

export default async function ZaloSettingsPage({ searchParams }: PageProps<"/settings/zalo">) {
  await requireAdmin();
  const params = await searchParams;
  const connectError = typeof params.error === "string" ? CONNECT_ERRORS[params.error] : undefined;

  const config = getZaloConfig();
  const missingEnv = missingZaloEnv();

  const supabase = await createClient();
  const [{ data: rawStatus }, { data: settings }, { data: profiles }, { data: history }] = await Promise.all([
    supabase.rpc("zalo_status"),
    supabase.from("system_settings").select("key, value").in("key", ["zalo_enabled", "zalo_oa_id", "zalo_oa_name"]),
    supabase.from("profiles").select("id, full_name, email, avatar_url, zalo_connected, notification_enabled").eq("active", true).order("full_name"),
    supabase
      .from("notification_logs")
      .select("id, type, status, error, scheduled_at, user:profiles!user_id(full_name, email)")
      .eq("provider", "ZALO")
      .order("scheduled_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  const status = statusSchema.safeParse(rawStatus);
  const connected = status.success && status.data.connected;
  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;
  const enabled = setting("zalo_enabled") === true;
  const oaName = typeof setting("zalo_oa_name") === "string" && setting("zalo_oa_name") ? String(setting("zalo_oa_name")) : null;
  const oaId = typeof setting("zalo_oa_id") === "string" && setting("zalo_oa_id") ? String(setting("zalo_oa_id")) : null;

  const members = (profiles ?? []).map((p) => ({ ...p, name: p.full_name || p.email }));
  const linked = members.filter((m) => m.zalo_connected);

  return (
    <>
      <PageHeader title="Zalo OA" description="Gửi nhắc việc tới Zalo của từng thành viên." />

      <Link href="/settings" className="mb-4 flex h-10 w-fit items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronLeft className="size-4" />
        Cài đặt
      </Link>

      {params.connected === "1" && connected && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-success-soft-foreground">
          <CircleCheck className="size-5 shrink-0" />
          Đã kết nối Zalo OA. Bật công tắc bên dưới để bắt đầu gửi.
        </p>
      )}
      {connectError && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-danger-soft-foreground">
          <CircleAlert className="size-5 shrink-0" />
          {connectError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* ---------- connection ---------- */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Kết nối</CardTitle>
            <CardDescription>Thông tin bí mật của Zalo chỉ nằm trên máy chủ, không bao giờ gửi xuống trình duyệt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              <StatusLine ok={missingEnv.length === 0} label="Cấu hình máy chủ" detail={missingEnv.length === 0 ? "Đủ biến môi trường" : `Thiếu: ${missingEnv.join(", ")}`} />
              <StatusLine
                ok={connected}
                label="Zalo OA"
                detail={
                  connected
                    ? [oaName ?? "Đã kết nối", oaId && `ID ${oaId}`].filter(Boolean).join(" · ")
                    : "Chưa kết nối"
                }
              />
              {connected && (
                <StatusLine
                  ok={status.success && status.data.dispatch_configured}
                  label="Tự động gửi"
                  detail={status.success && status.data.dispatch_configured ? "Hệ thống gọi bộ gửi mỗi phút khi có tin" : "Chưa đăng ký — hãy kết nối lại"}
                />
              )}
            </ul>

            {status.success && status.data.access_token_expires_at && (
              <p className="text-micro text-muted-foreground">Access token hiện tại hết hạn {when(status.data.access_token_expires_at)} — hệ thống tự gia hạn.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {config ? (
                // A plain link: the route redirects to Zalo, which must be a full page navigation.
                <a href="/api/zalo/oauth/start" className={cn(buttonVariants({ variant: connected ? "outline" : "default", size: "lg" }), "h-11 px-5")}>
                  {connected ? "Kết nối lại" : "Kết nối Zalo OA"}
                </a>
              ) : (
                <p className="text-caption text-muted-foreground">Thêm các biến môi trường còn thiếu trên máy chủ rồi deploy lại để kết nối.</p>
              )}
              {connected && <DisconnectButton />}
            </div>

            {config && (
              <details className="rounded-xl border">
                <summary className="flex h-11 cursor-pointer items-center px-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  Giá trị cần khai báo ở Zalo for Developers
                </summary>
                <div className="space-y-3 border-t p-4">
                  <CopyField label="Official Account Callback URL" value={`${config.appUrl}${zaloPaths.oauthCallback}`} />
                  <CopyField label="Webhook URL" value={`${config.appUrl}${zaloPaths.webhook}`} />
                  <p className="text-micro text-muted-foreground">Ở mục Webhook, bật sự kiện “Người dùng gửi tin nhắn văn bản” để thành viên liên kết được tài khoản.</p>
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        {/* ---------- enable / disable ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Gửi thông báo qua Zalo</CardTitle>
            <CardDescription>Khi tắt, thông báo vẫn hiện trong ứng dụng.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
              <span>
                <span className="block font-medium">{enabled ? "Đang bật" : "Đang tắt"}</span>
                <span className="block text-caption text-muted-foreground">{connected ? "Áp dụng cho thành viên đã liên kết" : "Cần kết nối Zalo OA trước"}</span>
              </span>
              <ZaloEnabledSwitch key={String(enabled)} enabled={enabled} disabled={!connected} />
            </div>
          </CardContent>
        </Card>

        {/* ---------- test message ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Tin nhắn thử</CardTitle>
            <CardDescription>Gửi ngay một tin tới Zalo của một thành viên để kiểm tra.</CardDescription>
          </CardHeader>
          <CardContent>
            {connected ? <TestMessageForm members={linked.map((m) => ({ id: m.id, name: m.name }))} /> : <p className="text-caption text-muted-foreground">Cần kết nối Zalo OA trước.</p>}
          </CardContent>
        </Card>

        {/* ---------- member mapping ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Thành viên</CardTitle>
            <CardDescription>
              {linked.length}/{members.length} người đã liên kết Zalo. Mỗi người tự liên kết ở trang Tài khoản.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex min-h-12 items-center gap-3 py-1.5">
                  <UserAvatar name={m.name} src={m.avatar_url} size="sm" className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.name}</span>
                    {!m.notification_enabled && <span className="block text-micro text-muted-foreground">Đã tắt nhận thông báo</span>}
                  </span>
                  {m.zalo_connected ? (
                    <>
                      <Badge className="bg-success-soft text-success-soft-foreground">Đã liên kết</Badge>
                      <UnlinkMemberButton userId={m.id} name={m.name} />
                    </>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">Chưa liên kết</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ---------- history ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử gửi</CardTitle>
            <CardDescription>5 tin gần nhất qua Zalo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!history?.length ? (
              <p className="text-caption text-muted-foreground">Chưa có tin nào gửi qua Zalo.</p>
            ) : (
              <ul className="divide-y">
                {history.map((row) => (
                  <li key={row.id} className="py-2">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        className={cn(
                          row.status === "SENT" && "bg-success-soft text-success-soft-foreground",
                          row.status === "FAILED" && "bg-danger-soft text-danger-soft-foreground",
                          (row.status === "PENDING" || row.status === "PROCESSING") && "bg-muted text-muted-foreground",
                        )}
                      >
                        {NOTIFICATION_STATUS_LABELS[row.status]}
                      </Badge>
                      <span className="font-medium">{NOTIFICATION_TYPE_LABELS[row.type]}</span>
                      <span className="text-caption text-muted-foreground">→ {row.user?.full_name || row.user?.email || "?"}</span>
                    </p>
                    <p className="mt-0.5 text-micro text-muted-foreground">{when(row.scheduled_at)}</p>
                    {row.error && <p className="mt-0.5 text-micro break-words text-danger">{row.error}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/settings/notifications?provider=ZALO"
              className="flex h-10 items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Xem toàn bộ nhật ký Zalo
              <ChevronRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />}
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="block text-caption break-words text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}
