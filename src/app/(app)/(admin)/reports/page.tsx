import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/shell/user-avatar";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, formatDateShort, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MAX_CUSTOM_DAYS, PERIOD_OPTIONS, reportHref, resolvePeriod } from "./period";
import { TrendChart, type TrendPoint } from "./trend-chart";

export const metadata: Metadata = { title: "Báo cáo" };

type Totals = {
  fixedExpected: number;
  fixedCompleted: number;
  fixedMissed: number;
  adhocCreated: number;
  adhocCompleted: number;
  adhocOnTime: number;
  adhocOutstanding: number;
  adhocOverdue: number;
};

const ZERO: Totals = {
  fixedExpected: 0,
  fixedCompleted: 0,
  fixedMissed: 0,
  adhocCreated: 0,
  adhocCompleted: 0,
  adhocOnTime: 0,
  adhocOutstanding: 0,
  adhocOverdue: 0,
};

/** completed / expected × 100, or null when nothing was expected (not 0% — there was nothing to miss). */
function rate(completed: number, expected: number) {
  return expected === 0 ? null : Math.round((completed / expected) * 100);
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const today = todayLocal();
  const period = resolvePeriod(await searchParams, today);

  const supabase = await createClient();
  // All numbers are aggregated in Postgres (report_summary / report_daily); no raw tasks come down here.
  const [{ data: profiles, error: profilesError }, { data: summary, error: summaryError }, { data: daily, error: dailyError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, avatar_url, role, active").order("full_name"),
    supabase.rpc("report_summary", { p_from: period.from, p_to: period.to }),
    supabase.rpc("report_daily", { p_from: period.from, p_to: period.to }),
  ]);
  if (profilesError || summaryError || dailyError) throw new Error("Không tải được báo cáo");

  const byMember = new Map<string, Totals>(
    summary.map((r) => [
      r.assignee_id,
      {
        fixedExpected: r.fixed_expected,
        fixedCompleted: r.fixed_completed,
        fixedMissed: r.fixed_missed,
        adhocCreated: r.adhoc_created,
        adhocCompleted: r.adhoc_completed,
        adhocOnTime: r.adhoc_on_time,
        adhocOutstanding: r.adhoc_outstanding,
        adhocOverdue: r.adhoc_overdue,
      },
    ]),
  );
  const hasNumbers = (t: Totals | undefined) => t !== undefined && Object.values(t).some((v) => v > 0);

  // Active employees always show; admins and deactivated members only when they have numbers in the period.
  const members = profiles
    .filter((p) => (p.active && p.role === "EMPLOYEE") || hasNumbers(byMember.get(p.id)))
    .map((p) => {
      const totals = byMember.get(p.id) ?? ZERO;
      return { id: p.id, name: p.full_name || p.email, avatarUrl: p.avatar_url, totals, rate: rate(totals.fixedCompleted, totals.fixedExpected) };
    })
    // Highest completion first; members with nothing expected last.
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name, "vi"));

  const team = members.reduce<Totals>(
    (sum, m) => Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v + m.totals[k as keyof Totals]])) as Totals,
    ZERO,
  );
  const teamRate = rate(team.fixedCompleted, team.fixedExpected);
  const onTimeRate = rate(team.adhocOnTime, team.adhocCompleted);

  const dayLabel = (day: string) => {
    const long = formatDateLong(day);
    return long.charAt(0).toUpperCase() + long.slice(1);
  };
  const completionTrend: TrendPoint[] = daily.map((d) => ({
    tick: formatDateShort(d.day),
    label: dayLabel(d.day),
    value: rate(d.fixed_completed, d.fixed_expected),
    // Today is still in progress, so its rate is expected to be low until the day ends.
    note: d.fixed_expected > 0 ? `${d.fixed_completed}/${d.fixed_expected} việc${d.day === today ? " · chưa hết ngày" : ""}` : undefined,
  }));
  const overdueTrend: TrendPoint[] = daily.map((d) => ({
    tick: formatDateShort(d.day),
    label: dayLabel(d.day),
    value: d.adhoc_overdue,
    note: "việc quá hạn",
  }));
  const showTrends = daily.length > 1;

  return (
    <>
      <PageHeader title="Báo cáo" description="Thống kê công việc theo ngày, tuần, tháng." />

      {/* ---------- filters: one row above everything they scope ---------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <nav aria-label="Kỳ báo cáo">
          <ul className="flex gap-1 rounded-xl bg-muted p-1">
            {PERIOD_OPTIONS.map((o) => {
              const active = o.key === period.key;
              return (
                <li key={o.key}>
                  <Link
                    href={o.key === "custom" ? reportHref("custom", { from: period.from, to: period.to > today ? today : period.to }) : reportHref(o.key)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-lg px-3.5 text-caption font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {period.key !== "custom" && (
          <div className="flex items-center gap-1">
            <StepLink href={period.prevHref} label="Kỳ trước">
              <ChevronLeft />
            </StepLink>
            <p className="min-w-36 text-center font-medium">{period.label}</p>
            <StepLink href={period.nextHref} label="Kỳ sau">
              <ChevronRight />
            </StepLink>
          </div>
        )}
      </div>

      {period.key === "custom" && (
        // Plain GET form: works without client JS and keeps the range in the URL.
        <form action="/reports" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-surface p-3 shadow-card">
          <input type="hidden" name="period" value="custom" />
          <div className="space-y-1">
            <Label htmlFor="r-from" className="text-caption text-muted-foreground">
              Từ ngày
            </Label>
            <Input id="r-from" name="from" type="date" required defaultValue={period.from} className="h-11 w-40 text-base" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-to" className="text-caption text-muted-foreground">
              Đến ngày
            </Label>
            <Input id="r-to" name="to" type="date" required defaultValue={period.to} className="h-11 w-40 text-base" />
          </div>
          <Button type="submit" size="lg" className="h-11 px-5">
            Xem
          </Button>
          {period.clamped && (
            <p role="status" className="basis-full text-caption text-warning-soft-foreground">
              Chỉ xem được tối đa {MAX_CUSTOM_DAYS} ngày — đang hiện {period.label}.
            </p>
          )}
        </form>
      )}

      <div className="space-y-4">
        {/* ---------- fixed tasks ---------- */}
        <section aria-labelledby="fixed-title" className="rounded-2xl border bg-surface p-4 shadow-card">
          <h3 id="fixed-title" className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            Việc cố định
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-8">
            <div>
              <p className="text-caption text-muted-foreground">Tỷ lệ hoàn thành công việc</p>
              <p className="text-[3rem] leading-none font-bold tracking-tight">{teamRate === null ? "—" : `${teamRate}%`}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <Tile label="Cần làm" value={team.fixedExpected} />
              <Tile label="Đã hoàn thành" value={team.fixedCompleted} dot="bg-success" />
              <Tile label="Bỏ lỡ" value={team.fixedMissed} dot="bg-danger" />
            </dl>
          </div>
          {team.fixedExpected === 0 && <p className="mt-3 text-caption text-muted-foreground">Không có việc cố định nào trong kỳ này.</p>}
        </section>

        {/* ---------- ad-hoc tasks ---------- */}
        <section aria-labelledby="adhoc-title" className="rounded-2xl border bg-surface p-4 shadow-card">
          <h3 id="adhoc-title" className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            Việc phát sinh
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="Tạo mới" value={team.adhocCreated} />
            <Tile label="Hoàn thành" value={team.adhocCompleted} dot="bg-success" />
            <Tile label="Đúng hạn" value={team.adhocOnTime} hint={onTimeRate === null ? undefined : `${onTimeRate}% việc đã xong`} />
            <Tile label="Đang tồn" value={team.adhocOutstanding} hint="Cuối kỳ" />
            <Tile label="Quá hạn" value={team.adhocOverdue} dot="bg-danger" hint="Cuối kỳ" />
          </dl>
        </section>

        {/* ---------- trends ---------- */}
        {showTrends && (
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="trend-title" className="rounded-2xl border bg-surface p-4 shadow-card">
              <h3 id="trend-title" className="font-semibold">
                Xu hướng hoàn thành
              </h3>
              <p className="mb-3 text-caption text-muted-foreground">Tỷ lệ hoàn thành việc cố định mỗi ngày</p>
              <TrendChart kind="line" tone="primary" unit="%" max={100} points={completionTrend} ariaLabel="Tỷ lệ hoàn thành việc cố định theo ngày" />
            </section>
            <section aria-labelledby="overdue-title" className="rounded-2xl border bg-surface p-4 shadow-card">
              <h3 id="overdue-title" className="font-semibold">
                Xu hướng quá hạn
              </h3>
              <p className="mb-3 text-caption text-muted-foreground">Số việc phát sinh còn quá hạn vào cuối mỗi ngày</p>
              <TrendChart kind="column" tone="danger" points={overdueTrend} ariaLabel="Số việc phát sinh quá hạn theo ngày" />
            </section>
          </div>
        )}

        {/* ---------- employee comparison ---------- */}
        <section aria-labelledby="compare-title" className="rounded-2xl border bg-surface p-4 shadow-card">
          <h3 id="compare-title" className="font-semibold">
            So sánh nhân viên
          </h3>
          <p className="mb-2 text-caption text-muted-foreground">Tỷ lệ hoàn thành việc cố định · {period.label}</p>
          {members.length === 0 ? (
            <p className="py-6 text-center text-caption text-muted-foreground">Chưa có nhân viên.</p>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={m.name} src={m.avatarUrl} size="sm" className="size-8" />
                    <p className="min-w-0 flex-1 truncate font-medium">{m.name}</p>
                    <p className="font-semibold tabular-nums">{m.rate === null ? "—" : `${m.rate}%`}</p>
                  </div>
                  {/* Meter: the track is a lighter step of the same hue. */}
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-primary-soft"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={m.rate ?? 0}
                    aria-label={`Tỷ lệ hoàn thành của ${m.name}`}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${m.rate ?? 0}%` }} />
                  </div>
                  <p className="mt-2 text-caption text-muted-foreground">
                    Cố định {m.totals.fixedCompleted}/{m.totals.fixedExpected}
                    {m.totals.fixedMissed > 0 && ` · bỏ lỡ ${m.totals.fixedMissed}`}
                    {" · "}Phát sinh: tạo {m.totals.adhocCreated}, xong {m.totals.adhocCompleted} (đúng hạn {m.totals.adhocOnTime}), tồn{" "}
                    {m.totals.adhocOutstanding}, quá hạn {m.totals.adhocOverdue}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- table view: every charted value without hovering ---------- */}
        {daily.length > 0 && (
          <details className="rounded-2xl border bg-surface shadow-card">
            <summary className="flex h-12 cursor-pointer items-center px-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Bảng số liệu theo ngày
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[34rem] text-caption tabular-nums">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Ngày
                    </th>
                    {["CĐ cần làm", "CĐ xong", "CĐ bỏ lỡ", "Tỷ lệ", "PS tạo", "PS xong", "PS quá hạn"].map((h) => (
                      <th key={h} scope="col" className="px-2 py-2 text-right font-medium last:pr-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => {
                    const r = rate(d.fixed_completed, d.fixed_expected);
                    return (
                      <tr key={d.day} className="border-t">
                        <th scope="row" className="px-4 py-2 text-left font-medium whitespace-nowrap">
                          {formatDateShort(d.day)}
                        </th>
                        {[d.fixed_expected, d.fixed_completed, d.fixed_missed, r === null ? "—" : `${r}%`, d.adhoc_created, d.adhoc_completed, d.adhoc_overdue].map(
                          (v, i) => (
                            <td key={i} className="px-2 py-2 text-right last:pr-4">
                              {v}
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t px-4 py-2 text-micro text-muted-foreground">CĐ = việc cố định · PS = việc phát sinh</p>
          </details>
        )}
      </div>
    </>
  );
}

function StepLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "size-10");
  if (!href) {
    return (
      <span aria-hidden className={cn(className, "opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** Stat tile. Numbers stay in text colour; a dot beside the label carries the status hue. */
function Tile({ label, value, dot, hint }: { label: string; value: number; dot?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-caption text-muted-foreground">
        {dot && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />}
        {label}
      </dt>
      <dd className="mt-0.5 text-title">{value}</dd>
      {hint && <p className="text-micro text-muted-foreground">{hint}</p>}
    </div>
  );
}
