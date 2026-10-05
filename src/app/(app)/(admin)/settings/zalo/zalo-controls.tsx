"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { disconnectZalo, sendZaloTest, setZaloEnabled, unlinkMemberZalo, type ZaloActionResult } from "./actions";

function report(result: ZaloActionResult, success: string) {
  if (result.ok) toast.success(result.message ?? success);
  else toast.error(result.error);
}

export function ZaloEnabledSwitch({ enabled, disabled }: { enabled: boolean; disabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await setZaloEnabled(next);
      if (!result.ok) setChecked(!next);
      report(result, next ? "Đã bật gửi qua Zalo" : "Đã tắt gửi qua Zalo");
    });
  }

  return <Switch checked={checked} onCheckedChange={toggle} disabled={disabled || pending} aria-label="Gửi thông báo qua Zalo" />;
}

export function DisconnectButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" size="lg" className="h-11" onClick={() => setConfirming(true)}>
        <Unlink />
        Ngắt kết nối
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="destructive"
        size="lg"
        className="h-11"
        disabled={pending}
        onClick={() => startTransition(async () => report(await disconnectZalo(), "Đã ngắt kết nối Zalo OA"))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Unlink />}
        Xác nhận ngắt
      </Button>
      <Button variant="ghost" size="lg" className="h-11" disabled={pending} onClick={() => setConfirming(false)}>
        Huỷ
      </Button>
    </div>
  );
}

export function TestMessageForm({ members }: { members: { id: string; name: string }[] }) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (members.length === 0) {
    return <p className="text-caption text-muted-foreground">Chưa có thành viên nào liên kết Zalo. Nhân viên tự liên kết ở trang Tài khoản.</p>;
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => report(await sendZaloTest(memberId), "Đã gửi tin thử"));
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="zalo-test-member">Gửi tới</Label>
        <select
          id="zalo-test-member"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="lg" className="h-11 px-5" disabled={pending || !memberId}>
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Gửi tin thử
      </Button>
    </form>
  );
}

export function UnlinkMemberButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="lg"
      className="h-9 text-muted-foreground"
      disabled={pending}
      aria-label={`Gỡ liên kết Zalo của ${name}`}
      onClick={() => startTransition(async () => report(await unlinkMemberZalo(userId), `Đã gỡ liên kết Zalo của ${name}`))}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Unlink />}
      Gỡ
    </Button>
  );
}

/** A value the admin has to paste into the Zalo developer console. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được — hãy chọn và sao chép thủ công");
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-caption text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 font-mono text-caption select-all">{value}</code>
        <Button type="button" variant="outline" size="icon-lg" className="size-10 shrink-0" aria-label={`Sao chép ${label}`} onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
