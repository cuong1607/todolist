import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ComingSoonFab } from "@/components/coming-soon-fab";

export const metadata: Metadata = { title: "Hôm nay" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Hôm nay" description="Những việc bạn cần làm trong ngày." />
      <EmptyState
        icon={<CalendarCheck />}
        title="Chưa có việc nào"
        description="Công việc cố định và phát sinh của bạn sẽ hiện ở đây."
      />
      <ComingSoonFab label="Thêm công việc" />
    </>
  );
}
