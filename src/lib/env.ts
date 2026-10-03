import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

// NEXT_PUBLIC_* vars must be referenced statically so Next.js can inline them in the browser bundle.
const rawPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

export function isSupabaseConfigured(): boolean {
  return publicEnvSchema.safeParse(rawPublicEnv).success;
}

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse(rawPublicEnv);
  if (!parsed.success) {
    throw new Error(
      "Thiếu hoặc sai biến môi trường Supabase. Copy .env.example thành .env.local và điền giá trị.\n" +
        z.prettifyError(parsed.error),
    );
  }
  return parsed.data;
}
