import type { Metadata } from "next";
import Link from "next/link";
import { LayoutList } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Công việc" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Công việc" description="Lịch sử công việc của bạn." />
      <EmptyState icon={<LayoutList />} title="Sắp có" description="Việc đang làm và việc phát sinh nằm ở trang Hôm nay.">
        <Button size="lg" nativeButton={false} render={<Link href="/today" />}>
          Đến trang Hôm nay
        </Button>
      </EmptyState>
    </>
  );
}
