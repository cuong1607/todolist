import { PageSkeleton } from "@/components/page-skeleton";

/** Shown inside the shell the moment the page is tapped, until its data arrives. */
export default function Loading() {
  return <PageSkeleton rows={3} />;
}
