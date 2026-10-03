"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { duration, transition } from "@/lib/motion";

const presets = [
  { name: "fast", label: `fast · ${duration.fast * 1000}ms`, transition: transition.fast },
  { name: "normal", label: `normal · ${duration.normal * 1000}ms`, transition: transition.normal },
  { name: "slow", label: `slow · ${duration.slow * 1000}ms`, transition: transition.slow },
  { name: "spring", label: "spring", transition: transition.spring },
];

export function MotionDemo() {
  const [on, setOn] = useState(false);

  return (
    <div className="space-y-4 rounded-xl border bg-surface p-5 shadow-card">
      <Button size="lg" onClick={() => setOn((v) => !v)}>
        Chạy thử
      </Button>
      <div className="space-y-3">
        {presets.map((p) => (
          <div key={p.name} className="space-y-1">
            <code className="font-mono text-micro text-muted-foreground">{p.label}</code>
            <div className="relative h-8 rounded-full bg-muted">
              <motion.div
                className="absolute top-1 left-1 size-6 rounded-full bg-primary shadow-xs"
                animate={{ left: on ? "calc(100% - 1.75rem)" : "0.25rem" }}
                transition={p.transition}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
