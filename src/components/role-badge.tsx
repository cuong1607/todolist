import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/navigation";

export function RoleBadge({ role }: { role: Role }) {
  return role === "ADMIN" ? (
    <Badge className="gap-1 bg-primary-soft text-primary-soft-foreground">
      <ShieldCheck className="size-3" />
      Admin
    </Badge>
  ) : (
    <Badge className="bg-muted text-muted-foreground">Nhân viên</Badge>
  );
}
