import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export function getServerEnv() {
  const parsed = serverEnvSchema.safeParse({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  if (!parsed.success) {
    throw new Error("Thiếu SUPABASE_SECRET_KEY (server-only). Xem .env.example.\n" + z.prettifyError(parsed.error));
  }
  return parsed.data;
}
