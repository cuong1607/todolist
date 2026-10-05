"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSummaryTimes, type SettingsFormState } from "./actions";

export function SummaryTimesForm({ endOfDay, adminDaily }: { endOfDay: string; adminDaily: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(updateSummaryTimes, {});

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu giờ gửi tổng kết");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="end_of_day_summary_time">Cho nhân viên</Label>
          <Input id="end_of_day_summary_time" name="end_of_day_summary_time" type="time" required defaultValue={endOfDay} className="h-11 text-base" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin_daily_summary_time">Cho admin (cả team)</Label>
          <Input id="admin_daily_summary_time" name="admin_daily_summary_time" type="time" required defaultValue={adminDaily} className="h-11 text-base" />
        </div>
      </div>
      <Button type="submit" size="lg" variant="secondary" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu giờ gửi
      </Button>
    </form>
  );
}
