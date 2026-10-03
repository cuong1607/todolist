import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shell/user-avatar";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { TemplateList, type Template } from "./template-list";

export const metadata: Metadata = { title: "Việc cố định" };

export default async function FixedTasksPage({ searchParams }: PageProps<"/fixed-tasks">) {
  await requireAdmin();
  const { member } = await searchParams;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("profiles")
    // `!assignee_id` disambiguates: templates also reference profiles via created_by.
    .select("id, full_name, email, avatar_url, role, fixed_task_templates!assignee_id(count)")
    .eq("active", true)
    .order("role", { ascending: false }) // employees first
    .order("full_name");

  if (!members?.length) {
    return (
      <>
        <PageHeader title="Việc cố định" />
        <EmptyState icon={<Users />} title="Chưa có thành viên" description="Thêm thành viên trước khi giao việc cố định.">
          <Button size="lg" nativeButton={false} render={<Link href="/members" />}>
            Đến trang Thành viên
          </Button>
        </EmptyState>
      </>
    );
  }

  const selected = members.find((m) => m.id === member) ?? members[0]!;

  const { data: rows } = await supabase
    .from("fixed_task_templates")
    .select("id, title, note, allow_employee_note, due_time, weekdays, sort_order, active, tasks(count)")
    .eq("assignee_id", selected.id)
    .order("sort_order")
    .order("created_at");

  const templates: Template[] = (rows ?? []).map(({ tasks, ...t }) => ({
    ...t,
    hasHistory: (tasks[0]?.count ?? 0) > 0,
  }));

  return (
    <>
      <PageHeader title="Việc cố định" description="Việc bắt buộc mỗi ngày của từng thành viên. Tự sinh lúc 00:05." />

      {/* Member picker — horizontal scroll on mobile */}
      <nav aria-label="Chọn thành viên" className="-mx-gutter mb-5 overflow-x-auto px-gutter md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 pb-1">
          {members.map((m) => {
            const active = m.id === selected.id;
            const name = m.full_name || m.email;
            return (
              <li key={m.id}>
                <Link
                  href={`/fixed-tasks?member=${m.id}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-normal) focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  <UserAvatar name={name} src={m.avatar_url} size="sm" className="size-8" />
                  {name}
                  <span className="text-micro opacity-70">{m.fixed_task_templates[0]?.count ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <TemplateList
        key={selected.id}
        assigneeId={selected.id}
        assigneeName={selected.full_name || selected.email}
        templates={templates}
      />
    </>
  );
}
