"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateProfile, type ProfileFormState } from "./actions";

type ProfileFormProps = {
  fullName: string;
  notificationEnabled: boolean;
};

export function ProfileForm({ fullName, notificationEnabled }: ProfileFormProps) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  const [notify, setNotify] = useState(notificationEnabled);

  useEffect(() => {
    if (state.ok) toast.success("Đã lưu hồ sơ");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="full_name">Họ tên</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={fullName}
          required
          maxLength={100}
          autoComplete="name"
          className="h-11 text-base"
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
        <span>
          <span className="block font-medium">Nhận thông báo</span>
          <span className="block text-caption text-muted-foreground">Nhắc việc và công việc mới được giao</span>
        </span>
        <Switch checked={notify} onCheckedChange={setNotify} aria-label="Nhận thông báo" />
        {notify && <input type="hidden" name="notification_enabled" value="on" />}
      </label>

      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full sm:w-auto sm:px-6">
        {pending && <Loader2 className="animate-spin" />}
        Lưu thay đổi
      </Button>
    </form>
  );
}
