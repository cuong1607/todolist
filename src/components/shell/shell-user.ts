import type { Role } from "@/lib/navigation";

/** The minimal, serializable slice of the profile the shell needs on the client. */
export type ShellUser = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
};
