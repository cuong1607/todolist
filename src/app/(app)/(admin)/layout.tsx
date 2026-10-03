import { requireAdmin } from "@/lib/auth";

/**
 * Gate for admin-only pages. Server Functions under here must still call
 * requireAdmin() themselves, and RLS remains the real enforcement layer.
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireAdmin();
  return children;
}
