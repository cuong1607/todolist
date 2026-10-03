"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* Respect the OS "reduce motion" setting for every animation in the app. */}
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster position="top-center" richColors />
      </MotionConfig>
    </ThemeProvider>
  );
}
