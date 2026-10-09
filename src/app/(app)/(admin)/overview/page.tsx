import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LinkPending } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/shell/user-avatar";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TODAY_TASK_COLUMNS } from "../../today/task-types";
import { MemberSheet } from "./member-sheet";
import { OverviewRealtime } from "./overview-realtime";
import { MAX_CUSTOM_DAYS, RANGE_OPTIONS, describeRange, overviewHref, resolveRange } from "./range";

export const metadata: Metadata = { title: "Tổng quan" };

type Stats = { fixedTotal: number; fixedDone: number; adhocTotal: number; adhocDone: number; overdue: number };
const NO_STATS: Stats = { fixedTotal: 0, fixedDone: 0, adhocTotal: 0, adhocDone: 0, overdue: 0 };

export default async function OverviewPage({ searchParams }: PageProps<"/overview">) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const today = todayLocal();
  const range = resolveRange(params, today);
  const rangeLabel = describeRange(range);
  const memberId = z.uuid().safeParse(params.member);

  const supabase = await createClient();
  // Which tasks count for a range is defined once, in SQL (private.task_in_range), for both calls.
  const [{ data: profiles, error: profilesError }, { data: rows, error: overviewError }, memberTasks] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, avatar_url, role, active").order("full_name"),
    supabase.rpc("team_overview", { p_from: range.from, p_to: range.to }),
    memberId.success
      ? supabase.rpc("tasks_in_range", { p_assignee_id: memberId.data, p_from: range.from, p_to: range.to }).select(TODAY_TASK_COLUMNS)
      : null,
  ]);
  if (profilesError || overviewError || memberTasks?.error) throw new Error("Không tải được tổng quan");

  const statsById = new Map<string, Stats>(
    rows.map((r) => [
      r.assignee_id,
      { fixedTotal: r.fixed_total, fixedDone: r.fixed_done, adhocTotal: r.adhoc_total, adhocDone: r.adhoc_done, overdue: r.overdue },
    ]),
  );

  // Active employees always show (an empty card is information too); admins and
  // deactivated members only when they have work in the range.
  const members = profiles
    .filter((p) => (p.active && p.role === "EMPLOYEE") || statsById.has(p.id))
    .map((p) => ({ ...p, name: p.full_name || p.email, stats: statsById.get(p.id) ?? NO_STATS }));

  const total = members.reduce((n, m) => n + m.stats.fixedTotal + m.stats.adhocTotal, 0);
  const done = members.reduce((n, m) => n + m.stats.fixedDone + m.stats.adhocDone, 0);
  const overdue = members.reduce((n, m) => n + m.stats.overdue, 0);

  const selected = memberId.success ? members.find((m) => m.id === memberId.data) : undefined;

  return (
    <>
      <OverviewRealtime />
      <PageHeader title="Tổng quan" description={`Tiến độ của cả team · ${rangeLabel}`} />

      {/* ---------- filters ---------- */}
      <nav aria-label="Khoảng thời gian" className="-mx-gutter mb-4 overflow-x-auto px-gutter md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 pb-1">
          {RANGE_OPTIONS.map((o) => {
            const active = o.key === range.key;
            return (
              <li key={o.key}>
                <Link
                  href={overviewHref({ key: o.key, from: range.from, to: range.to })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full border px-4 text-caption font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {range.key === "custom" && (
        // Plain GET form: works without client JS and keeps the range in the URL.
        <form action="/overview" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-surface p-3 shadow-card">
          <input type="hidden" name="range" value="custom" />
          <div className="space-y-1">
            <Label htmlFor="o-from" className="text-caption text-muted-foreground">
              Từ ngày
            </Label>
            <Input id="o-from" name="from" type="date" required defaultValue={range.from} className="h-11 w-40 text-base" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="o-to" className="text-caption text-muted-foreground">
              Đến ngày
            </Label>
            <Input id="o-to" name="to" type="date" required defaultValue={range.to} className="h-11 w-40 text-base" />
          </div>
          <Button type="submit" size="lg" className="h-11 px-5">
            Xem
          </Button>
          {range.clamped && (
            <p role="status" className="basis-full text-caption text-warning-soft-foreground">
              Chỉ xem được tối đa {MAX_CUSTOM_DAYS} ngày — đang hiện {rangeLabel}.
            </p>
          )}
        </form>
      )}

      {/* ---------- summary ---------- */}
      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Tổng việc" value={total} />
        <Summary label="Đã hoàn thành" value={done} tone="success" />
        <Summary label="Chưa hoàn thành" value={total - done} tone={total - done > 0 ? "primary" : undefined} />
        <Summary label="Quá hạn" value={overdue} tone={overdue > 0 ? "danger" : undefined} />
      </dl>

      {/* ---------- members ---------- */}
      {members.length === 0 ? (
        <EmptyState icon={<Users />} title="Chưa có nhân viên" description="Thêm thành viên để theo dõi tiến độ của team.">
          <Button size="lg" nativeButton={false} render={<Link href="/members" />}>
            Đến trang Thành viên
          </Button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {members.map((m) => (
            <li key={m.id}>
              <MemberCard
                href={overviewHref(range, m.id)}
                name={m.name}
                avatarUrl={m.avatar_url}
                inactive={!m.active}
                stats={m.stats}
              />
            </li>
          ))}
        </ul>
      )}

      {selected && memberTasks?.data && (
        <MemberSheet
          key={selected.id}
          member={{ id: selected.id, name: selected.name, avatarUrl: selected.avatar_url }}
          rangeLabel={rangeLabel}
          tasks={memberTasks.data}
          closeHref={overviewHref(range)}
          team={profiles.map((p) => ({ id: p.id, full_name: p.full_name || p.email, active: p.active }))}
          viewer={{ id: admin.id, isAdmin: true }}
        />
      )}
    </>
  );
}

const TONES = {
  success: "text-success",
  primary: "text-primary",
  danger: "text-danger",
} as const;

function Summary({ label, value, tone }: { label: string; value: number; tone?: keyof typeof TONES }) {
  return (
    <div className="rounded-2xl border bg-surface p-4 shadow-card">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      {/* Colour on an inner span: merged onto the dd, a text colour would drop `text-display`. */}
      <dd className="mt-1 text-display tabular-nums">
        <span className={tone && TONES[tone]}>{value}</span>
      </dd>
    </div>
  );
}

type MemberCardProps = { href: string; name: string; avatarUrl: string | null; inactive: boolean; stats: Stats };

/** Answers at a glance: done, still working, or overdue. Opens the member's task list. */
function MemberCard({ href, name, avatarUrl, inactive, stats }: MemberCardProps) {
  const total = stats.fixedTotal + stats.adhocTotal;
  const done = stats.fixedDone + stats.adhocDone;
  const remaining = total - done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const state =
    total === 0
      ? { label: "Không có việc", className: "bg-muted text-muted-foreground" }
      : stats.overdue > 0
        ? { label: `${stats.overdue} quá hạn`, className: "bg-danger-soft text-danger-soft-foreground" }
        : remaining > 0
          ? { label: `Còn ${remaining} việc`, className: "bg-primary-soft text-primary-soft-foreground" }
          : { label: "Xong hết", className: "bg-success-soft text-success-soft-foreground" };

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${name}: ${state.label}. Xem chi tiết`}
      // Red stays on the overdue badge and number only — the card itself never turns red.
      className="block rounded-2xl border bg-surface p-4 shadow-card outline-none transition-colors duration-(--duration-normal) hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <UserAvatar name={name} src={avatarUrl} size="lg" className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {name}
            {inactive && <span className="ml-2 text-micro font-normal text-muted-foreground">Đã khoá</span>}
          </p>
          <span className={cn("mt-1 inline-flex h-5 items-center rounded-full px-2 text-micro font-semibold", state.className)}>{state.label}</span>
        </div>
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <LinkPending>
            <ChevronRight className="size-5" />
          </LinkPending>
        </span>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`Tiến độ của ${name}`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out-soft", remaining === 0 && total > 0 ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="Cố định" value={`${stats.fixedDone}/${stats.fixedTotal}`} />
        <Figure label="Phát sinh" value={`${stats.adhocDone}/${stats.adhocTotal}`} />
        <Figure label="Quá hạn" value={String(stats.overdue)} danger={stats.overdue > 0} />
      </dl>
    </Link>
  );
}

function Figure({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-1.5">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", danger && "text-danger")}>{value}</dd>
    </div>
  );
}
