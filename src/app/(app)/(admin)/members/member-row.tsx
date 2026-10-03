"use client";

import { useOptimistic, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/shell/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/navigation";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { setMemberActive, setMemberRole } from "./actions";

export type Member = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  active: boolean;
};

const roles: { value: Role; label: string }[] = [
  { value: "EMPLOYEE", label: "Nhân viên" },
  { value: "ADMIN", label: "Admin" },
];

export function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(member);
  const name = member.full_name || member.email;

  function changeRole(role: Role) {
    if (role === optimistic.role) return;
    startTransition(async () => {
      setOptimistic({ ...optimistic, role });
      const result = await setMemberRole(member.id, role);
      if (result.ok) toast.success(`${name} giờ là ${role === "ADMIN" ? "Admin" : "Nhân viên"}`);
      else toast.error(result.error);
    });
  }

  function changeActive(active: boolean) {
    startTransition(async () => {
      setOptimistic({ ...optimistic, active });
      const result = await setMemberActive(member.id, active);
      if (result.ok) toast.success(active ? `Đã mở khoá ${name}` : `Đã khoá ${name}`);
      else toast.error(result.error);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-card transition-opacity duration-(--duration-normal) sm:flex-row sm:items-center",
        !optimistic.active && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar name={name} src={member.avatar_url} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {name}
            {isSelf && <span className="text-micro font-normal text-muted-foreground">(Bạn)</span>}
          </p>
          <p className="truncate text-caption text-muted-foreground">{member.email}</p>
        </div>
      </div>

      {isSelf ? (
        <RoleBadge role={optimistic.role} />
      ) : (
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div role="radiogroup" aria-label={`Quyền của ${name}`} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {roles.map((r) => {
              const active = optimistic.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => changeRole(r.value)}
                  className={cn(
                    "relative h-8 rounded-md px-3 text-caption font-medium whitespace-nowrap transition-colors duration-(--duration-normal)",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`role-pill-${member.id}`}
                      transition={transition.spring}
                      className="absolute inset-0 rounded-md bg-surface shadow-xs"
                    />
                  )}
                  <span className="relative">{r.label}</span>
                </button>
              );
            })}
          </div>

          <label className="flex shrink-0 items-center gap-2 text-caption whitespace-nowrap text-muted-foreground">
            {optimistic.active ? "Hoạt động" : "Đã khoá"}
            <Switch
              checked={optimistic.active}
              onCheckedChange={changeActive}
              aria-label={optimistic.active ? `Khoá ${name}` : `Mở khoá ${name}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
