import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, Bell, ChevronRight, ClipboardCheck, Sunrise, TriangleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { readPayload } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { formatDay, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Thông báo" };

const ICONS: Record<Enums<"notification_type">, React.ReactNode> = {
  MORNING_SUMMARY: <Sunrise />,
  DEADLINE_REMINDER: <AlarmClock />,
  OVERDUE_REMINDER: <TriangleAlert />,
  END_OF_DAY_SUMMARY: <ClipboardCheck />,
  ADMIN_DAILY_SUMMARY: <Users />,
  NEW_TASK: <Bell />,
  DEADLINE_CHANGED: <AlarmClock />,
  TEST: <Bell />,
};

/** The in-app inbox: what the IN_APP provider delivered to the signed-in member. */
export default async function NotificationsPage() {
  const me = await requireUser();
  const supabase = await createClient();

  // Filter by the session user explicitly: RLS alone would show an admin everyone's notifications.
  const { data: rows, error } = await supabase
    .from("notification_logs")
    .select("id, type, payload, sent_at")
    .eq("user_id", me.id)
    .eq("provider", "IN_APP")
    .eq("status", "SENT")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Không tải được thông báo");

  return (
    <>
      <PageHeader title="Thông báo" description="Nhắc việc và tổng kết gần đây của bạn." />

      {rows.length === 0 ? (
        <EmptyState icon={<Bell />} title="Chưa có thông báo" description="Nhắc deadline và tóm tắt mỗi ngày sẽ hiện ở đây.">
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/profile" />}>
            Cài đặt thông báo
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const { title, body, url } = readPayload(row.payload);
            const sentAt = row.sent_at ?? "";
            const content = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                    row.type === "OVERDUE_REMINDER" ? "bg-danger-soft text-danger-soft-foreground" : "bg-primary-soft text-primary-soft-foreground",
                  )}
                >
                  {ICONS[row.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{title}</span>
                    {sentAt && (
                      <span className="shrink-0 text-micro text-muted-foreground">
                        {formatDay(localDateOf(sentAt))} · {formatTimeLocal(sentAt)}
                      </span>
                    )}
                  </span>
                  {/* pre-line: summaries put one number per line */}
                  <span className="mt-0.5 block text-caption whitespace-pre-line text-muted-foreground">{body}</span>
                </span>
                {url && <ChevronRight aria-hidden className="size-5 shrink-0 self-center text-muted-foreground" />}
              </>
            );
            const className = "flex min-h-14 items-start gap-3 rounded-xl border bg-surface px-3 py-3 shadow-card";
            return (
              <li key={row.id}>
                {url ? (
                  <Link
                    href={url}
                    className={cn(className, "outline-none transition-colors duration-200 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
