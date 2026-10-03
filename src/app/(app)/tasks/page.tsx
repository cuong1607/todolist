import type { Metadata } from "next";
import { LayoutList } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ComingSoonFab } from "@/components/coming-soon-fab";

export const metadata: Metadata = { title: "Công việc" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Công việc" description="Tất cả công việc cố định và phát sinh." />
      <EmptyState icon={<LayoutList />} title="Danh sách trống" description="Công việc sẽ hiện ở đây khi được tạo." />
      <ComingSoonFab label="Thêm công việc" />
    </>
  );
}
