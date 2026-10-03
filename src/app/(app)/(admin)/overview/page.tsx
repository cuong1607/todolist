import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Tổng quan" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Tổng quan" description="Tiến độ của cả team trong ngày." />
      <EmptyState
        icon={<LayoutDashboard />}
        title="Chưa có dữ liệu"
        description="Tiến độ công việc của từng thành viên sẽ hiện ở đây."
      />
    </>
  );
}
