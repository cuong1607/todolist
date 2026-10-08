"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Gamepad2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GAMES, type EmbeddedGame } from "./games";

function frameSrc(game: EmbeddedGame) {
  if (!game.referrerParam) return game.src;
  const url = new URL(game.src);
  url.searchParams.set(game.referrerParam, window.location.href);
  return url.toString();
}

/** The break room: pick a game, play it in a frame served by its own site. */
export function GameHub() {
  const [game, setGame] = useState<EmbeddedGame | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  if (!game) {
    return (
      <ul className="space-y-2">
        {GAMES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setGame(item)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-surface px-3 py-3 text-left shadow-card outline-none transition-colors duration-200 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <Gamepad2 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">{item.description}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="lg" onClick={() => setGame(null)}>
          <ArrowLeft data-icon="inline-start" />
          Chọn game khác
        </Button>
        {/* Not every phone browser lets a page go full screen — the call is simply skipped there. */}
        <Button variant="outline" size="lg" onClick={() => void frame.current?.requestFullscreen?.()}>
          <Maximize data-icon="inline-start" />
          Toàn màn hình
        </Button>
      </div>

      <div
        ref={frame}
        className={cn(
          "mx-auto w-full overflow-hidden rounded-2xl border bg-surface shadow-card",
          // Sized so the whole board stays above the bottom nav. On a phone a 16:9 frame is too
          // short for the providers' start screens, so landscape games get a minimum height.
          game.orientation === "portrait"
            ? "h-[calc(100dvh-20rem)] min-h-96 max-w-md md:h-[calc(100dvh-14rem)]"
            : "aspect-video max-h-[calc(100dvh-14rem)] min-h-72",
        )}
      >
        <iframe
          key={game.id}
          src={frameSrc(game)}
          title={game.title}
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          className="size-full border-0"
        />
      </div>

      <p className="text-center text-micro text-muted-foreground">
        {game.title} được nhúng từ {game.provider} — điểm số và quảng cáo (nếu có) là của trang đó.
      </p>
    </div>
  );
}
