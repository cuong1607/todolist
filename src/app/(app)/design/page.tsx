import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotionDemo } from "./motion-demo";

export const metadata: Metadata = { title: "Design System" };

const colors = [
  { name: "primary", bg: "bg-primary", fg: "text-primary-foreground" },
  { name: "primary-soft", bg: "bg-primary-soft", fg: "text-primary-soft-foreground" },
  { name: "success", bg: "bg-success", fg: "text-success-foreground" },
  { name: "success-soft", bg: "bg-success-soft", fg: "text-success-soft-foreground" },
  { name: "warning", bg: "bg-warning", fg: "text-warning-foreground" },
  { name: "warning-soft", bg: "bg-warning-soft", fg: "text-warning-soft-foreground" },
  { name: "danger", bg: "bg-danger", fg: "text-danger-foreground" },
  { name: "danger-soft", bg: "bg-danger-soft", fg: "text-danger-soft-foreground" },
  { name: "background", bg: "bg-background border", fg: "text-foreground" },
  { name: "surface", bg: "bg-surface border", fg: "text-foreground" },
  { name: "muted", bg: "bg-muted", fg: "text-muted-foreground" },
  { name: "border", bg: "bg-border", fg: "text-foreground" },
];

const typeScale = [
  { name: "display", className: "text-display", sample: "Hôm nay của bạn" },
  { name: "title", className: "text-title", sample: "Công việc cố định" },
  { name: "body", className: "text-body", sample: "Kiểm tra đơn hàng và cập nhật trạng thái." },
  { name: "caption", className: "text-caption text-muted-foreground", sample: "Hạn chót 17:00 · Giao bởi Admin" },
  { name: "micro", className: "text-micro text-muted-foreground uppercase tracking-wide", sample: "Phát sinh" },
];

const radii = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-full"];
const shadows = ["shadow-xs", "shadow-card", "shadow-raised", "shadow-overlay"];
const spacing = [1, 2, 3, 4, 6, 8, 12];

export default function DesignPage() {
  return (
    <>
      <PageHeader title="Design System" description="Token dùng chung cho toàn bộ giao diện." />

      <div className="space-y-10">
        <Section title="Màu sắc">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {colors.map((c) => (
              <div key={c.name} className={`flex h-20 items-end rounded-xl p-3 ${c.bg} ${c.fg}`}>
                <span className="text-caption font-medium">{c.name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-4 rounded-xl border bg-surface p-5 shadow-card">
            {typeScale.map((t) => (
              <div key={t.name} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
                <code className="w-20 shrink-0 font-mono text-micro text-muted-foreground">{t.name}</code>
                <p className={t.className}>{t.sample}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Bo góc & Bóng">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap gap-3 rounded-xl border bg-surface p-5">
              {radii.map((r) => (
                <div key={r} className={`flex size-16 items-center justify-center bg-primary-soft text-micro text-primary-soft-foreground ${r}`}>
                  {r.replace("rounded-", "")}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 rounded-xl bg-muted p-5">
              {shadows.map((s) => (
                <div key={s} className={`flex size-20 items-center justify-center rounded-xl bg-surface text-micro text-muted-foreground ${s}`}>
                  {s.replace("shadow-", "")}
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Spacing (lưới 4px)">
          <div className="space-y-2 rounded-xl border bg-surface p-5">
            {spacing.map((n) => (
              <div key={n} className="flex items-center gap-4">
                <code className="w-10 font-mono text-micro text-muted-foreground">{n}</code>
                <div className="h-3 rounded-sm bg-primary" style={{ width: `calc(var(--spacing) * ${n})` }} />
                <span className="text-micro text-muted-foreground">{n * 4}px</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Animation">
          <MotionDemo />
        </Section>

        <Section title="Thành phần">
          <div className="space-y-5 rounded-xl border bg-surface p-5 shadow-card">
            <div className="flex flex-wrap gap-2">
              <Button size="lg">Hoàn thành</Button>
              <Button size="lg" variant="secondary">Để sau</Button>
              <Button size="lg" variant="outline">Chi tiết</Button>
              <Button size="lg" variant="ghost">Bỏ qua</Button>
              <Button size="lg" variant="destructive">Xoá</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary-soft text-primary-soft-foreground">Cố định</Badge>
              <Badge className="bg-warning-soft text-warning-soft-foreground">Phát sinh</Badge>
              <Badge className="bg-success-soft text-success-soft-foreground">Đã xong</Badge>
              <Badge className="bg-danger-soft text-danger-soft-foreground">Quá hạn</Badge>
            </div>
            <div className="max-w-sm space-y-2">
              <Label htmlFor="demo-input">Tên công việc</Label>
              <Input id="demo-input" placeholder="VD: Kiểm tra kho cuối ngày" className="h-11" />
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-title">{title}</h3>
      {children}
    </section>
  );
}
