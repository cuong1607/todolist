"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createZaloLinkCode, unlinkZalo } from "./actions";

type Props = {
  connected: boolean;
  /** The team's OA is connected and switched on. */
  available: boolean;
  oaId: string | null;
  oaName: string | null;
};

/** While a code is on screen, check this often whether the webhook has linked the account. */
const POLL_MS = 4000;

/** Member-side linking: get a code → send it to the OA in Zalo → the webhook attaches the Zalo account. */
export function ZaloLink({ connected, available, oaId, oaName }: Props) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const waiting = code !== null && !connected;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, router]);

  function getCode() {
    startTransition(async () => {
      const result = await createZaloLinkCode();
      if (result.ok && result.code) setCode(result.code);
      else if (!result.ok) toast.error(result.error);
    });
  }

  function unlink() {
    startTransition(async () => {
      const result = await unlinkZalo();
      if (result.ok) {
        setCode(null);
        toast.success("Đã ngắt kết nối Zalo");
      } else toast.error(result.error);
    });
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được — hãy nhập mã thủ công");
    }
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success-soft-foreground">
            <MessageCircle className="size-5" />
          </span>
          <div>
            <Badge className="bg-success-soft text-success-soft-foreground">Đã kết nối</Badge>
            <p className="mt-1 text-caption text-muted-foreground">{available ? "Nhắc việc sẽ gửi tới Zalo của bạn." : "Team đang tạm tắt gửi qua Zalo."}</p>
          </div>
        </div>
        <Button variant="outline" size="lg" className="h-11 w-full" disabled={pending} onClick={unlink}>
          {pending && <Loader2 className="animate-spin" />}
          Ngắt kết nối Zalo
        </Button>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <MessageCircle className="size-5" />
        </span>
        <Badge className="bg-muted text-muted-foreground">Team chưa bật Zalo</Badge>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="space-y-3">
        <p className="text-caption text-muted-foreground">Kết nối để nhận nhắc việc ngay trong Zalo.</p>
        <Button size="lg" className="h-11 w-full" disabled={pending} onClick={getCode}>
          {pending ? <Loader2 className="animate-spin" /> : <MessageCircle />}
          Kết nối Zalo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-caption text-muted-foreground">
        <li>
          Mở Zalo, tìm và <span className="font-medium text-foreground">Quan tâm</span> OA {oaName ? <span className="font-medium text-foreground">{oaName}</span> : "của team"}.
        </li>
        <li>Gửi mã dưới đây cho OA.</li>
      </ol>

      <div className="flex items-center gap-2">
        <output aria-label="Mã kết nối Zalo" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-muted font-mono text-title tracking-[0.2em] select-all">
          {code}
        </output>
        <Button type="button" variant="outline" size="icon-lg" className="size-12 shrink-0" aria-label="Sao chép mã" onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>

      {oaId && (
        <a href={`https://zalo.me/${encodeURIComponent(oaId)}`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}>
          <ExternalLink />
          Mở Zalo OA
        </a>
      )}

      <p className="flex items-center gap-2 text-caption text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" />
        Đang chờ bạn gửi mã… Mã có hiệu lực 15 phút.
      </p>
      <button type="button" className="text-caption font-medium text-primary hover:underline" disabled={pending} onClick={getCode}>
        Lấy mã mới
      </button>
    </div>
  );
}
