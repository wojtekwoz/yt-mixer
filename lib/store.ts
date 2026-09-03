"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { thumbnailFor, type ParsedLink } from "./youtube";

export type DeckId = "A" | "B";
export const DECK_IDS: DeckId[] = ["A", "B"];

export type Track = {
  /** Queue-entry identity. The same video can sit in the queue twice. */
  id: string;
  videoId: string;
  title: string | null;
  author: string | null;
  thumbnail: string;
  /** Where playback starts, in seconds. Comes from a `?t=` in the link. */
  cueIn: number;
  /** Nickname of the guest who requested it, when it came from a session. */
  requestedBy?: string;
};

export type DeckState = {
  track: Track | null;
  /** True once the IFrame player for this deck has reported readiness. */
  ready: boolean;
  playing: boolean;
  buffering: boolean;
  /** Set when the player refuses a video (private, deleted, embed disabled). */
  error: string | null;
  position: number;
  duration: number;
};

function emptyDeck(): DeckState {
  return {
    track: null,
    ready: false,
    playing: false,
    buffering: false,
    error: null,
    position: 0,
    duration: 0,
  };
}

export function trackFromLink(link: ParsedLink, requestedBy?: string): Track {
  return {
    requestedBy,
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${link.videoId}-${Math.random().toString(36).slice(2)}`,
    videoId: link.videoId,
    title: null,
    author: null,
    thumbnail: thumbnailFor(link.videoId),
    cueIn: link.start,
  };
}

type MixerState = {
  decks: Record<DeckId, DeckState>;
  queue: Track[];

  /** 0 = you hear record A alone, 1 = record B alone. */
  crossfader: number;
  autoDJ: boolean;
  /** Non-null while a mix is running; `to` is the record being brought up. */
  fading: { to: DeckId } | null;

  patchDeck: (id: DeckId, patch: Partial<DeckState>) => void;
  setDeckTrack: (id: DeckId, track: Track | null) => void;
  setCrossfader: (value: number) => void;
  setAutoDJ: (value: boolean) => void;
  setFading: (value: { to: DeckId } | null) => void;

  enqueue: (tracks: Track[]) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  takeNextFromQueue: () => Track | null;
};

export const useMixer = create<MixerState>()(
  persist(
    (set, get) => ({
      decks: { A: emptyDeck(), B: emptyDeck() },
      queue: [],
      crossfader: 0,
      autoDJ: false,
      fading: null,

      patchDeck: (id, patch) =>
        set((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } })),

      setDeckTrack: (id, track) =>
        set((s) => ({
          decks: {
            ...s.decks,
            [id]: {
              ...s.decks[id],
              track,
              position: track?.cueIn ?? 0,
              duration: 0,
              playing: false,
              buffering: false,
              error: null,
            },
          },
        })),

      setCrossfader: (value) => set({ crossfader: Math.min(1, Math.max(0, value)) }),
      setAutoDJ: (value) => set({ autoDJ: value }),
      setFading: (value) => set({ fading: value }),

      enqueue: (tracks) => set((s) => ({ queue: [...s.queue, ...tracks] })),
      removeFromQueue: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
      clearQueue: () => set({ queue: [] }),

      updateTrack: (id, patch) =>
        set((s) => {
          // A track can live in the queue and on a record at once; patch both.
          const decks = { ...s.decks };
          for (const deckId of DECK_IDS) {
            const deck = decks[deckId];
            if (deck.track?.id === id) {
              decks[deckId] = { ...deck, track: { ...deck.track, ...patch } };
            }
          }
          return { queue: s.queue.map((t) => (t.id === id ? { ...t, ...patch } : t)), decks };
        }),

      takeNextFromQueue: () => {
        const [next, ...rest] = get().queue;
        if (!next) return null;
        set({ queue: rest });
        return next;
      },
    }),
    {
      name: "yt-mixer",
      version: 2,
      // Only the queue is worth carrying across reloads. Everything else is
      // bound to players that no longer exist.
      partialize: (s) => ({ queue: s.queue }),
      // v1 persisted mixer settings that no longer exist. Without this the
      // whole blob is discarded and anyone upgrading silently loses their
      // queue — the one thing that was worth keeping.
      migrate: (persisted) => ({ queue: (persisted as { queue?: Track[] })?.queue ?? [] }),
    },
  ),
);
