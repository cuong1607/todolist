"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Several ticks in a row (or the 00:05 generator) collapse into one refresh. */
const DEBOUNCE_MS = 400;
/** Overdue is time-based: re-derive it even when nobody touches a task. */
const TICK_MS = 60_000;

/**
 * Keeps the dashboard live: any change to a task the admin can read re-renders the
 * server page (numbers come from SQL, so there is no client-side copy to keep in sync).
 */
export function OverviewRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    (async () => {
      // Authenticate the socket BEFORE subscribing, otherwise Realtime evaluates RLS as anon
      // and silently delivers nothing.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel("overview")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
        .subscribe();
    })();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => document.visibilityState === "visible" && refresh(), TICK_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
