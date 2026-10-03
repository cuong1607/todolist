"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createMember, type CreateMemberState } from "./actions";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function CreateMemberDialog({ open, onOpenChange }: Props) {
  const [state, action, pending] = useActionState<CreateMemberState, FormData>(createMember, {});
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (state.ok) {
      toast.success("Đã tạo tài khoản. Gửi email và mật khẩu cho thành viên.");
      onOpenChange(false);
    }
    // nonce makes repeated successes re-trigger this effect
  }, [state.ok, state.nonce, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm thành viên</DialogTitle>
          <DialogDescription>Tạo tài khoản đăng nhập bằng email và mật khẩu.</DialogDescription>
        </DialogHeader>

        {/* key resets the form fields each time the dialog opens */}
        <form key={String(open)} action={action} className="space-y-4">
          {state.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-caption text-danger-soft-foreground">
              {state.error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="m-name">Họ tên</Label>
            <Input id="m-name" name="full_name" required maxLength={100} className="h-11 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-email">Email</Label>
            <Input id="m-email" name="email" type="email" inputMode="email" autoCapitalize="none" required className="h-11 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-password">Mật khẩu tạm</Label>
            <Input
              id="m-password"
              name="password"
              type="text"
              autoComplete="new-password"
              minLength={8}
              required
              className="h-11 font-mono text-base"
            />
            <p className="text-micro text-muted-foreground">Tối thiểu 8 ký tự. Thành viên có thể đổi sau.</p>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
            <span>
              <span className="block font-medium">Quyền Admin</span>
              <span className="block text-caption text-muted-foreground">Xem toàn bộ team, quản lý thành viên</span>
            </span>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} aria-label="Quyền Admin" />
          </label>
          <input type="hidden" name="role" value={isAdmin ? "ADMIN" : "EMPLOYEE"} />

          <Button type="submit" size="lg" disabled={pending} className="h-11 w-full">
            {pending && <Loader2 className="animate-spin" />}
            Tạo tài khoản
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
