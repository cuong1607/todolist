"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSummaryTimes, type SettingsFormState } from "./actions";

type Props = { morning: string; endOfDay: string; adminDaily: string };

const FIELDS = [
  { name: "morning_summary_time", prop: "morning", label: "Tóm tắt buổi sáng", hint: "Mỗi người một tin: việc cố định, đến hạn, quá hạn" },
  { name: "end_of_day_summary_time", prop: "endOfDay", label: "Tổng kết cuối ngày", hint: "Cho từng nhân viên" },
  { name: "admin_daily_summary_time", prop: "adminDaily", label: "Tổng kết team", hint: "Cho admin" },
] as const satisfies readonly { name: string; prop: keyof Props; label: string; hint: string }[];

export function SummaryTimesForm(props: Props) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(updateSummaryTimes, {});

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu giờ gửi");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div className="divide-y rounded-xl border">
        {FIELDS.map((field) => (
          <div key={field.name} className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
            <Label htmlFor={field.name} className="block min-w-0">
              <span className="block font-medium">{field.label}</span>
              <span className="block text-caption font-normal text-muted-foreground">{field.hint}</span>
            </Label>
            <Input id={field.name} name={field.name} type="time" required defaultValue={props[field.prop]} className="h-11 w-32 shrink-0 text-base" />
          </div>
        ))}
      </div>
      <Button type="submit" size="lg" variant="secondary" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu giờ gửi
      </Button>
    </form>
  );
}
