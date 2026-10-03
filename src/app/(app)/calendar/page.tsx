import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Lịch" };

// Placeholder: the calendar view is a later phase. Nav slot is reserved now (Phase 6 spec).
export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Lịch" description="Xem công việc theo ngày." />
      <EmptyState icon={<CalendarDays />} title="Sắp có" description="Việc sắp tới hiện đang nằm ở cuối trang Hôm nay.">
        <Button size="lg" nativeButton={false} render={<Link href="/today" />}>
          Đến trang Hôm nay
        </Button>
      </EmptyState>
    </>
  );
}
