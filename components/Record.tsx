"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtube";
import {
  crossfadeGains,
  handlePlayerStateChange,
  registerPlayer,
  togglePlay,
  unregisterPlayer,
} from "@/lib/engine";
import { useMixer, type DeckId } from "@/lib/store";

const ERROR_MESSAGES: Record<number, string> = {
  2: "This link didn't work.",
  5: "This one won't play here.",
  100: "This song is gone.",
  101: "The owner turned off playing this one here.",
  150: "The owner turned off playing this one here.",
};

/**
 * One record: a spinning vinyl disc with the live video as its label.
 *
 * Size and brightness track the deck's gain, so the crossfade is visible
 * before it is audible — the big record is the one you hear. That is the whole
 * mental model, and it needs no text.
 */
export function Record({ id }: { id: DeckId }) {
  const deck = useMixer((s) => s.decks[id]);
  // The same curve the engine sends to the player, so what you see is what you
  // hear rather than an approximation of it.
  const gain = useMixer((s) => crossfadeGains(s.crossfader)[id]);

  const progress = deck.duration > 0 ? Math.min(1, deck.position / deck.duration) : 0;
  const label = deck.track?.title ?? null;

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => togglePlay(id)}
        disabled={!deck.track}
        aria-label={
          deck.track
            ? `${deck.playing ? "Pause" : "Play"} ${label ?? "this song"}`
            : "Empty record"
        }
        className="group relative aspect-square w-full max-w-[13rem] rounded-full transition-[transform,opacity] duration-150 ease-[var(--ease-out-quart)] disabled:cursor-default"
        style={{
          transform: `scale(${0.72 + gain * 0.28})`,
          opacity: deck.track ? 0.5 + gain * 0.5 : 0.28,
        }}
      >
        {/* Grooves. Rotates only while the song is actually playing. */}
        <span
          aria-hidden
          className={`vinyl absolute inset-0 rounded-full ${
            deck.playing ? "disc-spin" : "disc-spin disc-paused"
          }`}
        />

        <span aria-hidden className="sheen absolute inset-0 rounded-full" />

        {/* Progress. A ring is enough; there is no need for a number. */}
        <span
          aria-hidden
          className="absolute -inset-[6px] rounded-full"
          style={{
            background: `conic-gradient(var(--color-go) ${progress * 360}deg, transparent 0)`,
            mask: "radial-gradient(circle, transparent calc(50% - 5px), #000 calc(50% - 5px))",
            WebkitMask:
              "radial-gradient(circle, transparent calc(50% - 5px), #000 calc(50% - 5px))",
          }}
        />

        {/* The label: the real player, cropped to a circle. Keeping the iframe
            at a real rendered size avoids the throttling that hidden media
            frames are subject to. */}
        <span className="absolute inset-[22%] overflow-hidden rounded-full bg-ink">
          <PlayerFrame id={id} />
        </span>

        {/* Spindle hole. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-2 ring-ink"
        />

        {!deck.playing && deck.track && (
          <span
            aria-hidden
            className="absolute inset-[22%] grid place-items-center rounded-full bg-ink/55 text-3xl text-bg"
          >
            ▶
          </span>
        )}

        {deck.buffering && deck.track && (
          <span
            aria-hidden
            className="absolute inset-[22%] grid place-items-center rounded-full bg-ink/55 text-sm font-semibold text-bg"
          >
            …
          </span>
        )}
      </button>

      <p
        className="line-clamp-2 min-h-[2.5rem] px-1 text-center text-[0.95rem] font-medium leading-tight text-ink"
        title={label ?? undefined}
      >
        {deck.error ? (
          <span className="text-ink-soft">{deck.error}</span>
        ) : (
          label ?? <span className="text-ink-soft">Empty</span>
        )}
      </p>
    </div>
  );
}

/**
 * Hosts one persistent YouTube IFrame player.
 *
 * Created once and kept for the lifetime of the record; tracks are swapped in
 * by the engine. Recreating it per track would strand every automatic mix
 * behind the browser's autoplay gesture requirement.
 */
function PlayerFrame({ id }: { id: DeckId }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    let disposed = false;
    let player: YTPlayer | undefined;

    // YT.Player replaces the node it's given with an iframe. Hand it a child
    // React doesn't own, so unmount never double-removes a DOM node.
    const host = document.createElement("div");
    container?.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (disposed) return;
        player = new YT.Player(host, {
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!disposed && player) registerPlayer(id, player);
            },
            onStateChange: (event: { data: number }) => {
              if (!disposed) handlePlayerStateChange(id, event.data);
            },
            onError: (event: { data: number }) => {
              if (disposed) return;
              useMixer.getState().patchDeck(id, {
                error: ERROR_MESSAGES[event.data] ?? "This one didn't play.",
                playing: false,
                buffering: false,
              });
            },
          },
        }) as YTPlayer;
      })
      .catch(() => {
        if (!disposed) {
          useMixer.getState().patchDeck(id, { error: "No internet?" });
        }
      });

    return () => {
      disposed = true;
      unregisterPlayer(id);
      try {
        player?.destroy();
      } catch {
        // Already gone.
      }
      if (container) container.innerHTML = "";
    };
  }, [id]);

  return (
    <span
      ref={containerRef}
      aria-hidden
      /* 16:9 scaled to cover the circular label, and pointer-events off so the
         tap always reaches our own play/pause button. */
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-video w-[178%] -translate-x-1/2 -translate-y-1/2 [&_iframe]:h-full [&_iframe]:w-full"
    />
  );
}
