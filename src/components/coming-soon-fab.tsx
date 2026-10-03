"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Fab } from "@/components/shell/fab";

// Placeholder until task creation lands.
export function ComingSoonFab({ label }: { label: string }) {
  return <Fab icon={Plus} label={label} onClick={() => toast.info("Tính năng sắp có")} />;
}
