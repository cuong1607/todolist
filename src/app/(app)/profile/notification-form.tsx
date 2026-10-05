"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trimSeconds } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";
import { updateNotificationSettings, type ProfileFormState } from "./actions";

export type NotificationPrefs = Pick<
  Tables<"notification_settings">,
  | "daily_summary_enabled"
  | "daily_summary_time"
  | "deadline_reminder_enabled"
  | "remind_before_minutes"
  | "overdue_alert_enabled"
  | "end_of_day_summary_enabled"
>;

const REMIND_OPTIONS = [
  { value: 15, label: "15 phút" },
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 120, label: "2 giờ" },
  { value: 1440, label: "1 ngày" },
];

export function NotificationForm({ settings, masterEnabled }: { settings: NotificationPrefs; masterEnabled: boolean }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateNotificationSettings, {});
  const [daily, setDaily] = useState(settings.daily_summary_enabled);
  const [reminder, setReminder] = useState(settings.deadline_reminder_enabled);
  const [overdue, setOverdue] = useState(settings.overdue_alert_enabled);
  const [endOfDay, setEndOfDay] = useState(settings.end_of_day_summary_enabled);

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu cài đặt thông báo");
    else if (state.error) toast.error(state.error);
  }, [state]);

  // A value saved outside the presets (e.g. via the API) still has to be selectable.
  const current = settings.remind_before_minutes;
  const remindOptions = REMIND_OPTIONS.some((o) => o.value === current)
    ? REMIND_OPTIONS
    : [...REMIND_OPTIONS, { value: current, label: `${current} phút` }].sort((a, b) => a.value - b.value);

  return (
    <form action={action} className="space-y-4">
      {!masterEnabled && (
        <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-caption text-warning-soft-foreground">
          Bạn đang tắt “Nhận thông báo” nên các mục dưới đây chưa có hiệu lực.
        </p>
      )}

      <div className={cn("divide-y rounded-xl border", !masterEnabled && "opacity-60")}>
        <Row title="Tóm tắt việc hôm nay" description="Gửi danh sách việc mỗi sáng">
          <Switch checked={daily} onCheckedChange={setDaily} aria-label="Tóm tắt việc hôm nay" />
          {daily && <input type="hidden" name="daily_summary_enabled" value="on" />}
        </Row>
        <Row title="Giờ gửi tóm tắt" htmlFor="n-daily-time" muted={!daily}>
          <Input
            id="n-daily-time"
            name="daily_summary_time"
            type="time"
            required
            defaultValue={trimSeconds(settings.daily_summary_time)}
            className="h-11 w-32 text-base"
          />
        </Row>
        <Row title="Nhắc trước deadline" description="Cho việc có giờ hạn">
          <Switch checked={reminder} onCheckedChange={setReminder} aria-label="Nhắc trước deadline" />
          {reminder && <input type="hidden" name="deadline_reminder_enabled" value="on" />}
        </Row>
        <Row title="Nhắc trước" htmlFor="n-remind" muted={!reminder}>
          <select
            id="n-remind"
            name="remind_before_minutes"
            defaultValue={current}
            className="h-11 w-32 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {remindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Báo việc quá hạn" description="Khi một việc trễ deadline">
          <Switch checked={overdue} onCheckedChange={setOverdue} aria-label="Báo việc quá hạn" />
          {overdue && <input type="hidden" name="overdue_alert_enabled" value="on" />}
        </Row>
        <Row title="Tổng kết cuối ngày" description="Bạn đã xong bao nhiêu việc hôm nay">
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

type RowProps = { title: string; description?: string; htmlFor?: string; muted?: boolean; children: React.ReactNode };

function Row({ title, description, htmlFor, muted, children }: RowProps) {
  const text = (
    <>
      <span className="block font-medium">{title}</span>
      {description && <span className="block text-caption text-muted-foreground">{description}</span>}
    </>
  );
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 transition-opacity duration-200", muted && "opacity-50")}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="min-w-0">
          {text}
        </label>
      ) : (
        <div className="min-w-0">{text}</div>
      )}
      {children}
    </div>
  );
}
