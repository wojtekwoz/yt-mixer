"use client";

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useMixer } from "@/lib/store";
import { setCrossfaderByHand } from "@/lib/engine";

/**
 * The one control that matters — and the robot's mouth.
 *
 * It spans the full width directly under the two records, so the knob sits
 * under whichever record you are hearing. Position means exactly what it looks
 * like it means — no legend, no A/B labels, no numbers.
 *
 * The knob is the tongue: it hangs below the track on purpose, so it reads as
 * part of a face rather than as a slider.
 */
export function BigFader() {
  const crossfader = useMixer((s) => s.crossfader);
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromPointer = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Inset by half a knob so the knob centre can reach both ends.
    const pad = 34;
    const usable = Math.max(1, rect.width - pad * 2);
    setCrossfaderByHand(Math.min(1, Math.max(0, (clientX - rect.left - pad) / usable)));
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -0.1, ArrowRight: 0.1 };
    if (event.key in steps) {
      event.preventDefault();
      setCrossfaderByHand(crossfader + steps[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setCrossfaderByHand(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCrossfaderByHand(1);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Which record you hear"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(crossfader * 100)}
      aria-valuetext={
        crossfader < 0.15
          ? "Left record"
          : crossfader > 0.85
            ? "Right record"
            : "Both records"
      }
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => event.buttons > 0 && setFromPointer(event.clientX)}
      onKeyDown={onKeyDown}
      className="relative h-[60px] w-full cursor-grab touch-none select-none rounded-full bg-bg active:cursor-grabbing"
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line"
      />
      {/* The tongue. Taller than the mouth and sitting low in it, so it laps
          over the bottom edge instead of being contained by it. */}
      <svg
        aria-hidden
        viewBox="0 0 64 68"
        width={64}
        height={68}
        className="pointer-events-none absolute -translate-x-1/2 drop-shadow-[0_6px_10px_oklch(0.18_0_0/0.26)]"
        style={{ left: `calc(34px + ${crossfader} * (100% - 68px))`, top: 18 }}
      >
        {/* Narrower where it leaves the mouth, bulging to full width, broad
            round tip — a tongue lolling out rather than a knob. */}
        <path
          d="M12 0 C6 14 0 26 0 40 C0 57 14 68 32 68 C50 68 64 57 64 40 C64 26 58 14 52 0 Z"
          fill="var(--color-tongue)"
        />
        <path
          d="M32 10 C29 24 29 38 32 52"
          fill="none"
          stroke="var(--color-tongue-deep)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
