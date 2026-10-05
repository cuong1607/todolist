import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";
import { NOTIFICATION_PROVIDER_LABELS, NOTIFICATION_STATUS_LABELS, NOTIFICATION_TYPE_LABELS, readPayload } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { formatDay, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Nhật ký thông báo" };

const STATUSES = ["PENDING", "PROCESSING", "SENT", "FAILED"] as const satisfies readonly Enums<"notification_status">[];

const PROVIDERS = ["IN_APP", "ZALO"] as const satisfies readonly Enums<"notification_provider">[];

const STATUS_STYLES: Record<Enums<"notification_status">, string> = {
  PENDING: "bg-muted text-muted-foreground",
  PROCESSING: "bg-primary-soft text-primary-soft-foreground",
  SENT: "bg-success-soft text-success-soft-foreground",
  FAILED: "bg-danger-soft text-danger-soft-foreground",
};

const when = (iso: string) => `${formatDay(localDateOf(iso))} · ${formatTimeLocal(iso)}`;

/** The engine's queue and audit trail: every notification, on every provider, with its outcome. */
export default async function NotificationLogPage({ searchParams }: PageProps<"/settings/notifications">) {
  await requireAdmin();
  const { status: param, provider: providerParam } = await searchParams;
  const status = STATUSES.find((s) => s === param);
  const provider = PROVIDERS.find((p) => p === providerParam);
  const hrefFor = (s: (typeof STATUSES)[number] | undefined) => {
    const query = new URLSearchParams({ ...(s && { status: s }), ...(provider && { provider }) }).toString();
    return query ? `/settings/notifications?${query}` : "/settings/notifications";
  };

  const supabase = await createClient();
  let query = supabase
    .from("notification_logs")
    // `!user_id`: explicit, in case another FK to profiles is added later.
    .select("id, type, provider, status, payload, scheduled_at, sent_at, failed_at, retry_count, error, user:profiles!user_id(full_name, email)")
    .order("scheduled_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  if (provider) query = query.eq("provider", provider);
  const { data: rows, error } = await query;
  if (error) throw new Error("Không tải được nhật ký thông báo");

  return (
    <>
      <PageHeader
        title="Nhật ký thông báo"
        description={provider ? `100 thông báo gần nhất qua ${NOTIFICATION_PROVIDER_LABELS[provider]}.` : "100 thông báo gần nhất của cả team."}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/settings" className="flex h-10 items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronLeft className="size-4" />
          Cài đặt
        </Link>
        <nav aria-label="Lọc theo trạng thái">
          <ul className="flex flex-wrap gap-2">
            {[undefined, ...STATUSES].map((s) => {
              const active = s === status;
              return (
                <li key={s ?? "all"}>
                  <Link
                    href={hrefFor(s)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-full border px-3.5 text-caption font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {s ? NOTIFICATION_STATUS_LABELS[s] : "Tất cả"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Send />} title="Chưa có thông báo nào" description="Hệ thống kiểm tra mỗi phút và ghi lại mọi thông báo ở đây." />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const { title, body } = readPayload(row.payload);
            return (
              <li key={row.id} className="rounded-xl border bg-surface px-4 py-3 shadow-card">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge className={STATUS_STYLES[row.status]}>{NOTIFICATION_STATUS_LABELS[row.status]}</Badge>
                  <span className="font-medium">{NOTIFICATION_TYPE_LABELS[row.type]}</span>
                  <span className="text-caption text-muted-foreground">
                    → {row.user?.full_name || row.user?.email || "?"} · {NOTIFICATION_PROVIDER_LABELS[row.provider]}
                  </span>
                </div>
                <p className="mt-1.5 text-caption font-medium">{title}</p>
                {body && <p className="text-caption whitespace-pre-line text-muted-foreground">{body}</p>}
                <p className="mt-1 text-micro text-muted-foreground">
                  Hẹn gửi {when(row.scheduled_at)}
                  {row.sent_at && ` · Đã gửi ${when(row.sent_at)}`}
                  {row.failed_at && ` · Dừng lúc ${when(row.failed_at)}`}
                  {row.retry_count > 0 && ` · ${row.retry_count} lần lỗi`}
                </p>
                {row.error && <p className="mt-1 text-micro break-words text-danger">{row.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
