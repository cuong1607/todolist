"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEADLINE_REMINDER_OPTIONS } from "@/lib/notifications";
import type { NotificationSchedule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { updateSummaryTimes, type SettingsFormState } from "./actions";

const ROW = "flex min-h-14 items-center justify-between gap-4 px-4 py-2.5";

export function SummaryTimesForm({ schedule }: { schedule: NotificationSchedule }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(updateSummaryTimes, {});
  const [adminDaily, setAdminDaily] = useState(schedule.adminDailyEnabled);

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu cài đặt thông báo");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div className="divide-y rounded-xl border">
        <TimeRow name="morning_summary_time" label="Tóm tắt buổi sáng" hint="Mỗi người một tin: việc cố định, đến hạn, quá hạn" value={schedule.morning} />
        <TimeRow
          name="end_of_day_summary_time"
          label="Tổng kết cuối ngày"
          hint="Mỗi người một tin: việc đã xong, còn tồn, quá hạn"
          value={schedule.endOfDay}
        />
        <div className={ROW}>
          <div className="min-w-0">
            <span className="block font-medium">Gửi tổng kết team</span>
            <span className="block text-caption text-muted-foreground">Mỗi admin một tin: cả team và từng người</span>
          </div>
          <Switch checked={adminDaily} onCheckedChange={setAdminDaily} aria-label="Gửi tổng kết team" />
          {adminDaily && <input type="hidden" name="admin_daily_summary_enabled" value="on" />}
        </div>
        <TimeRow
          name="admin_daily_summary_time"
          label="Giờ gửi tổng kết team"
          hint="Nên sau bản tin cuối ngày của nhân viên"
          value={schedule.adminDaily}
          muted={!adminDaily}
        />
        <div className={ROW}>
          <Label htmlFor="deadline_reminder_minutes" className="block min-w-0">
            <span className="block font-medium">Nhắc trước deadline</span>
            <span className="block text-caption font-normal text-muted-foreground">Cho việc phát sinh có giờ hạn</span>
          </Label>
          <select
            id="deadline_reminder_minutes"
            name="deadline_reminder_minutes"
            defaultValue={schedule.deadlineReminder}
            className="h-11 w-32 shrink-0 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {DEADLINE_REMINDER_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? "Tắt" : `${minutes} phút`}
              </option>
            ))}
          </select>
        </div>
        <div className={ROW}>
          <div className="min-w-0">
            <span className="block font-medium">Múi giờ</span>
            <span className="block text-caption text-muted-foreground">Mọi giờ ở trên tính theo múi giờ này</span>
          </div>
          <span className="shrink-0 text-muted-foreground">{schedule.timezone}</span>
        </div>
      </div>
      <Button type="submit" size="lg" variant="secondary" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu thông báo
      </Button>
    </form>
  );
}

type TimeRowProps = { name: string; label: string; hint: string; value: string; muted?: boolean };

function TimeRow({ name, label, hint, value, muted }: TimeRowProps) {
  return (
    <div className={cn(ROW, "transition-opacity duration-200", muted && "opacity-50")}>
      <Label htmlFor={name} className="block min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-caption font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Input id={name} name={name} type="time" required defaultValue={value} className="h-11 w-32 shrink-0 text-base" />
    </div>
  );
}
