import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MembersView } from "./members-view";

export const metadata: Metadata = { title: "Thành viên" };

export default async function MembersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  // RLS returns every profile for an admin.
  const { data: members, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role, active")
    .order("active", { ascending: false })
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) throw new Error("Không tải được danh sách thành viên");

  return <MembersView members={members} currentUserId={me.id} />;
}
