"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transition } from "@/lib/motion";
import { login, type LoginState } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const error = state.error ?? notice;

  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-surface p-5 shadow-card sm:p-6">
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            key={error}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition.normal}
            className="overflow-hidden"
          >
            <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-caption text-danger-soft-foreground">
              <CircleAlert className="size-4 shrink-0" />
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          defaultValue={state.email}
          placeholder="ban@congty.vn"
          className="h-11 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 text-base"
        />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full text-base">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
