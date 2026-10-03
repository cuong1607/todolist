import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" description="Tiến độ của cả team trong ngày." />
      <EmptyState icon={<Users />} title="Chưa có thành viên" description="Thành viên và tiến độ sẽ hiện ở đây." />
    </>
  );
}
