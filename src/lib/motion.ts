import type { Transition, Variants } from "motion/react";

/** Animation timing tokens — keep in sync with --duration-* / --ease-* in globals.css. */
export const duration = {
  fast: 0.12,
  normal: 0.2,
  slow: 0.32,
} as const;

export const ease = {
  outSoft: [0.22, 1, 0.36, 1],
  inOutSoft: [0.65, 0, 0.35, 1],
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.outSoft },
  normal: { duration: duration.normal, ease: ease.outSoft },
  slow: { duration: duration.slow, ease: ease.outSoft },
  /** Snappy spring for taps, toggles, active indicators. */
  spring: { type: "spring", stiffness: 500, damping: 35, mass: 0.8 },
} satisfies Record<string, Transition>;

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
};

/** Parent variant that staggers children using `fadeInUp`. */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
