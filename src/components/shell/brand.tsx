import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export function Brand() {
  return (
    <Link href="/today" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
        <CalendarCheck className="size-[1.125rem]" />
      </span>
      <span className="font-heading text-base font-bold tracking-tight">Team Todo</span>
    </Link>
  );
}
