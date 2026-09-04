"use client";

import { useEffect, useRef } from "react";
import { crossfadeGains } from "@/lib/engine";
import { useMixer } from "@/lib/store";

const BAR_COUNT = 56;

/**
 * The robot's hair.
 *
 * This is NOT a spectrum analyser and cannot be: YouTube plays in a
 * cross-origin iframe, so the audio samples are unreachable from this page.
 * Faking bars that appear to follow the music would be a lie the whole app
 * otherwise avoids.
 *
 * Instead it visualises the thing we genuinely know — the mix. Each deck drives
 * its own travelling wave, scaled by that deck's real equal-power gain and
 * whether it is actually playing. So silence is flat, one record playing gives
 * one wave, and a crossfade visibly blends two.
 */
export function Visualizer() {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const paint = (elapsed: number) => {
      const { decks, crossfader } = useMixer.getState();
      const gains = crossfadeGains(crossfader);
      // A deck contributes only while it is genuinely producing sound.
      const a = decks.A.playing ? gains.A : 0;
      const b = decks.B.playing ? gains.B : 0;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;

        const x = i / (BAR_COUNT - 1);
        // Taller through the middle so the band reads as a head of hair
        // rather than a level meter.
        const crown = 0.45 + 0.55 * Math.sin(x * Math.PI);

        const waveA = 0.5 + 0.5 * Math.sin(x * 11 + elapsed * 2.4) * Math.sin(x * 5 - elapsed * 1.3);
        const waveB = 0.5 + 0.5 * Math.sin(x * 17 - elapsed * 1.9) * Math.sin(x * 7 + elapsed * 2.8);

        const energy = Math.min(1, a * waveA + b * waveB);
        bar.style.transform = `scaleY(${0.06 + 0.94 * energy * crown})`;
      }
    };

    if (reduced) {
      // No shimmer, but the hair must still track what is playing — so repaint
      // on state changes instead of on every frame. Painting once at mount
      // would freeze it at "silent" forever.
      paint(0);
      return useMixer.subscribe(() => paint(0));
    }

    const step = (now: number) => {
      paint(now / 1000);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      aria-hidden
      className="flex h-20 w-full items-end gap-[3px] overflow-hidden sm:h-24"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full min-w-0 flex-1 origin-bottom rounded-t-full bg-ink"
          style={{ transform: "scaleY(0.06)" }}
        />
      ))}
    </div>
  );
}
