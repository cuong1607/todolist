import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  // Vietnamese names: family name first, given name last — use first + last.
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

type UserAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
};

export function UserAvatar({ name, src, size = "default", className }: UserAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className={cn("bg-primary-soft font-semibold text-primary-soft-foreground", size === "lg" ? "text-body" : "text-micro")}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
