"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { crossfadeGains } from "@/lib/engine";
import { useMixer } from "@/lib/store";
import {
  canListen,
  getListenMessage,
  getListenStatus,
  readSpectrum,
  startListening,
  stopListening,
  subscribeListen,
} from "@/lib/listen";

const BAR_COUNT = 56;

/**
 * The robot's hair.
 *
 * Two sources, in order of honesty:
 *
 * 1. Real audio, when the DJ has shared this tab's sound. YouTube's iframe is
 *    cross-origin, so tab capture is the only way the page can ever reach the
 *    samples; this reads the FFT straight off an AnalyserNode.
 * 2. Otherwise the mix itself — each deck drives a wave scaled by its real
 *    equal-power gain and play state. Silence is flat and a crossfade blends
 *    two waves. It is not the audio and does not pretend to be.
 */
export function Visualizer() {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  const status = useSyncExternalStore(subscribeListen, getListenStatus, () => "idle" as const);
  const message = useSyncExternalStore(subscribeListen, getListenMessage, () => null);
  const supported = useSyncExternalStore(subscribeListen, canListen, () => true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const paint = (elapsed: number) => {
      const bins = readSpectrum();

      if (bins) {
        // Log-ish spacing across the lower two thirds of the spectrum, where
        // music actually lives; the top bins are mostly empty air.
        const usable = Math.floor(bins.length * 0.72);
        for (let i = 0; i < BAR_COUNT; i++) {
          const bar = barsRef.current[i];
          if (!bar) continue;
          const t = i / (BAR_COUNT - 1);
          const index = Math.min(usable - 1, Math.floor(Math.pow(t, 1.75) * usable));
          bar.style.transform = `scaleY(${0.05 + 0.95 * (bins[index] / 255)})`;
        }
        return;
      }

      const { decks, crossfader } = useMixer.getState();
      const gains = crossfadeGains(crossfader);
      const a = decks.A.playing ? gains.A : 0;
      const b = decks.B.playing ? gains.B : 0;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        const x = i / (BAR_COUNT - 1);
        const crown = 0.45 + 0.55 * Math.sin(x * Math.PI);
        const waveA = 0.5 + 0.5 * Math.sin(x * 11 + elapsed * 2.4) * Math.sin(x * 5 - elapsed * 1.3);
        const waveB = 0.5 + 0.5 * Math.sin(x * 17 - elapsed * 1.9) * Math.sin(x * 7 + elapsed * 2.8);
        const energy = Math.min(1, a * waveA + b * waveB);
        bar.style.transform = `scaleY(${0.05 + 0.95 * energy * crown})`;
      }
    };

    if (reduced) {
      // No shimmer, but the hair must still track what is playing — so repaint
      // on state changes rather than only at mount, which would freeze it.
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

  // Real audio gets the accent: the colour change is the signal that these bars
  // are the sound itself rather than a drawing of the mix.
  const live = status === "live";

  return (
    <div className="relative px-4 pt-4">
      <div aria-hidden className="flex h-20 w-full items-end gap-[3px] sm:h-24">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className={`h-full min-w-0 flex-1 origin-bottom rounded-t-full ${
              live ? "bg-go" : "bg-ink"
            }`}
            style={{ transform: "scaleY(0.05)" }}
          />
        ))}
      </div>

      {supported && (
        <button
          type="button"
          onClick={live ? stopListening : startListening}
          aria-pressed={live}
          title={
            live
              ? "Stop using the tab's sound"
              : "Use this tab's real sound. Pick this tab and switch on “Also share tab audio”."
          }
          className={`absolute right-4 top-4 h-11 rounded-full px-3 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] ${
            live ? "bg-go text-ink" : "bg-bg text-ink-soft"
          }`}
        >
          {status === "starting" ? "…" : live ? "Ear on" : "Ear off"}
        </button>
      )}

      {message && (
        <p className="absolute inset-x-4 -bottom-1 text-center text-[0.65rem] text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
