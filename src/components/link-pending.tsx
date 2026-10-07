"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Local pending state for a `<Link>` whose target keeps the current page on screen (e.g. a
 * search-param change that opens a sheet), so no `loading.tsx` skeleton answers the tap.
 * Place it inside the link: it shows `children` normally and a spinner while that link's
 * navigation is in flight. The spinner fades in after 150ms, so fast navigations never flash.
 */
export function LinkPending({ children }: { children?: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (!pending) return children;
  return (
    <span aria-hidden className="flex shrink-0 animate-in fill-mode-both delay-150 duration-150 fade-in-0">
      <Loader2 className="size-4 animate-spin" />
    </span>
  );
}
