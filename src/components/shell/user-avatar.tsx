import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Placeholder until auth lands in Phase 2.
export function UserAvatar() {
  return (
    <Avatar aria-label="Tài khoản">
      <AvatarFallback className="bg-primary-soft text-caption font-semibold text-primary-soft-foreground">
        TT
      </AvatarFallback>
    </Avatar>
  );
}
