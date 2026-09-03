"use client";

import { useEffect } from "react";
import { Record } from "./Record";
import { BigFader } from "./BigFader";
import { UpNext } from "./UpNext";
import { ShareButton } from "./ShareButton";
import { NowPlayingPublisher } from "./NowPlayingPublisher";
import { useMixer } from "@/lib/store";
import { FADE_SECONDS, mix, startEngine } from "@/lib/engine";

export function MixerConsole() {
  useEffect(() => startEngine(), []);
  useSpaceToMix();

  const autoDJ = useMixer((s) => s.autoDJ);
  const setAutoDJ = useMixer((s) => s.setAutoDJ);
  const fading = useMixer((s) => s.fading);
  const crossfader = useMixer((s) => s.crossfader);
  const decks = useMixer((s) => s.decks);

  const target = crossfader <= 0.5 ? "B" : "A";
  const canMix = Boolean(decks[target].track);
  // While a mix runs, the fader position doubles as its progress.
  const mixProgress = fading ? (fading.to === "B" ? crossfader : 1 - crossfader) : 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[44rem] flex-col gap-7 px-5 pb-10 pt-5">
      <NowPlayingPublisher />

      <header className="flex items-center justify-between">
        <h1 className="text-base font-extrabold tracking-tight">yt mixer</h1>
        <ShareButton />
      </header>

      {/* Never stacks: the fader below depends on this left/right mapping. */}
      <div className="grid grid-cols-2 gap-4">
        <Record id="A" />
        <Record id="B" />
      </div>

      <BigFader />

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={mix}
          disabled={!canMix && !fading}
          className="key relative h-[4.5rem] w-full max-w-sm overflow-hidden rounded-full bg-go text-[clamp(1.5rem,6vw,2.25rem)] font-extrabold tracking-tight text-ink disabled:bg-surface disabled:text-ink-soft"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-go-deep/25"
            style={{ width: `${mixProgress * 100}%` }}
          />
          <span className="relative">{fading ? "Stop" : "Mix"}</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={autoDJ}
          onClick={() => setAutoDJ(!autoDJ)}
          className={`h-12 rounded-full px-5 text-sm font-bold ${
            autoDJ ? "bg-go text-ink" : "bg-surface text-ink-soft"
          }`}
        >
          {autoDJ ? "Auto is on" : "Auto is off"}
        </button>
        <p className="-mt-2 max-w-xs text-center text-xs leading-relaxed text-ink-soft">
          {autoDJ
            ? `Songs play one after another. Each mix takes ${FADE_SECONDS} seconds.`
            : "Turn this on and songs play by themselves."}
        </p>
      </div>

      <hr className="border-line" />

      <UpNext />
    </div>
  );
}

/** Space runs a mix. The only shortcut worth keeping. */
function useSpaceToMix() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target?.tagName ?? "")
      ) {
        return;
      }
      event.preventDefault();
      mix();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
