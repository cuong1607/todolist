"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";
import { updateNotificationSettings, type ProfileFormState } from "./actions";

export type NotificationPrefs = Pick<
  Tables<"notification_settings">,
  | "daily_summary_enabled"
  | "deadline_reminder_enabled"
  | "overdue_alert_enabled"
  | "end_of_day_summary_enabled"
>;

type Props = {
  settings: NotificationPrefs;
  masterEnabled: boolean;
  /** The team's morning summary time (HH:MM), set by an admin — shown, not editable here. */
  morningTime: string;
  /** The team's end-of-day summary time (HH:MM), set by an admin — shown, not editable here. */
  endOfDayTime: string;
  /** The team's reminder lead time in minutes (0 = switched off by an admin) — shown, not editable here. */
  deadlineReminder: number;
};

export function NotificationForm({ settings, masterEnabled, morningTime, endOfDayTime, deadlineReminder }: Props) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateNotificationSettings, {});
  const [daily, setDaily] = useState(settings.daily_summary_enabled);
  const [reminder, setReminder] = useState(settings.deadline_reminder_enabled);
  const [overdue, setOverdue] = useState(settings.overdue_alert_enabled);
  const [endOfDay, setEndOfDay] = useState(settings.end_of_day_summary_enabled);

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu cài đặt thông báo");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      {!masterEnabled && (
        <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-caption text-warning-soft-foreground">
          Bạn đang tắt “Nhận thông báo” nên các mục dưới đây chưa có hiệu lực.
        </p>
      )}

      <div className={cn("divide-y rounded-xl border", !masterEnabled && "opacity-60")}>
        <Row title="Tóm tắt việc hôm nay" description={`Một tin mỗi sáng lúc ${morningTime}`}>
          <Switch checked={daily} onCheckedChange={setDaily} aria-label="Tóm tắt việc hôm nay" />
          {daily && <input type="hidden" name="daily_summary_enabled" value="on" />}
        </Row>
        <Row
          title="Nhắc trước deadline"
          description={deadlineReminder > 0 ? `Trước ${deadlineReminder} phút, cho việc phát sinh có giờ hạn` : "Quản lý đang tắt cho cả team"}
          muted={deadlineReminder === 0}
        >
          <Switch checked={reminder} onCheckedChange={setReminder} aria-label="Nhắc trước deadline" />
          {reminder && <input type="hidden" name="deadline_reminder_enabled" value="on" />}
        </Row>
        <Row title="Báo việc quá hạn" description="Khi một việc trễ deadline">
          <Switch checked={overdue} onCheckedChange={setOverdue} aria-label="Báo việc quá hạn" />
          {overdue && <input type="hidden" name="overdue_alert_enabled" value="on" />}
        </Row>
        <Row title="Tổng kết cuối ngày" description={`Một tin lúc ${endOfDayTime}: việc đã xong, còn tồn, quá hạn`}>
          <Switch checked={endOfDay} onCheckedChange={setEndOfDay} aria-label="Tổng kết cuối ngày" />
          {endOfDay && <input type="hidden" name="end_of_day_summary_enabled" value="on" />}
        </Row>
      </div>

      <Button type="submit" size="lg" variant="secondary" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu thông báo
      </Button>
    </form>
  );
}

type RowProps = { title: string; description?: string; muted?: boolean; children: React.ReactNode };

function Row({ title, description, muted, children }: RowProps) {
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 transition-opacity duration-200", muted && "opacity-50")}>
      <div className="min-w-0">
        <span className="block font-medium">{title}</span>
        {description && <span className="block text-caption text-muted-foreground">{description}</span>}
      </div>
      {children}
    </div>
  );
}
