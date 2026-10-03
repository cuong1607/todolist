"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Sends the user to /login when the session ends elsewhere (other tab, expiry). */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return null;
}
