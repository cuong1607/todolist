"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/shell/fab";
import { fadeInUp, stagger } from "@/lib/motion";
import { MemberRow, type Member } from "./member-row";
import { CreateMemberDialog } from "./create-member-dialog";

export function MembersView({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const activeCount = members.filter((m) => m.active).length;

  return (
    <>
      <PageHeader
        title="Thành viên"
        description={`${activeCount} đang hoạt động · ${members.length} tài khoản`}
        actions={
          <Button size="lg" onClick={() => setOpen(true)}>
            <UserPlus />
            Thêm thành viên
          </Button>
        }
      />

      <motion.ul variants={stagger} initial="hidden" animate="visible" className="space-y-2">
        {members.map((member) => (
          <motion.li key={member.id} variants={fadeInUp} layout>
            <MemberRow member={member} isSelf={member.id === currentUserId} />
          </motion.li>
        ))}
      </motion.ul>

      <Fab icon={UserPlus} label="Thêm thành viên" onClick={() => setOpen(true)} />
      <CreateMemberDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
