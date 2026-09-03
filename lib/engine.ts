"use client";

/**
 * Transport + mixing engine.
 *
 * The YouTube players are cross-origin iframes, so they can't live in React
 * state. They're held in a module-level registry here and driven imperatively;
 * the store holds only the serializable mirror that the UI renders from.
 *
 * Both players are created once at startup and never destroyed. Swapping tracks
 * via loadVideoById on a player that already has a user gesture behind it is
 * what lets an unattended mix start playback without tripping autoplay policy.
 */

import { useMixer, DECK_IDS, type DeckId, type Track } from "./store";
import { PlayerState, type YTPlayer } from "./youtube";

/** How long a mix takes. Fixed: one less thing on screen, and 8s sounds right. */
export const FADE_SECONDS = 8;

const players: Partial<Record<DeckId, YTPlayer>> = {};

export function otherDeck(id: DeckId): DeckId {
  return id === "A" ? "B" : "A";
}

export function registerPlayer(id: DeckId, player: YTPlayer) {
  players[id] = player;
  useMixer.getState().patchDeck(id, { ready: true });
  applyGains(true);

  // A player registered after a track was already assigned (React strict-mode
  // remount, or a rehydrated deck) needs that track pushed into it.
  const track = useMixer.getState().decks[id].track;
  if (track) player.cueVideoById({ videoId: track.videoId, startSeconds: track.cueIn });
}

export function unregisterPlayer(id: DeckId) {
  delete players[id];
  useMixer.getState().patchDeck(id, { ready: false });
}

/* ---------------------------------------------------------------- gains -- */

/**
 * Equal-power crossfade. Linear faders dip ~3dB in the middle of a blend;
 * cos/sin keeps summed power constant so a half-mix doesn't sound quiet.
 */
export function crossfadeGains(crossfader: number): Record<DeckId, number> {
  const t = (crossfader * Math.PI) / 2;
  return { A: Math.cos(t), B: Math.sin(t) };
}

export function deckGain(id: DeckId): number {
  return crossfadeGains(useMixer.getState().crossfader)[id];
}

const lastApplied: Partial<Record<DeckId, number>> = {};

/** Pushes computed gains into both players, skipping no-op postMessages. */
export function applyGains(force = false) {
  for (const id of DECK_IDS) {
    const player = players[id];
    if (!player) continue;
    const volume = Math.round(Math.min(100, Math.max(0, deckGain(id) * 100)));
    if (!force && lastApplied[id] === volume) continue;
    lastApplied[id] = volume;
    try {
      player.setVolume(volume);
    } catch {
      // Player torn down mid-flight; the next tick re-applies.
    }
  }
}

/* ------------------------------------------------------------ transport -- */

export function play(id: DeckId) {
  if (!useMixer.getState().decks[id].track) return;
  applyGains(true);
  players[id]?.playVideo();
}

export function pause(id: DeckId) {
  players[id]?.pauseVideo();
}

export function togglePlay(id: DeckId) {
  const deck = useMixer.getState().decks[id];
  if (!deck.track) return;
  if (deck.playing) pause(id);
  else play(id);
}

/* ----------------------------------------------------------- deck load -- */

export function loadTrackToDeck(id: DeckId, track: Track, opts: { autoplay?: boolean } = {}) {
  useMixer.getState().setDeckTrack(id, track);
  applyGains(true);

  const player = players[id];
  if (!player) return;

  const args = { videoId: track.videoId, startSeconds: track.cueIn };
  if (opts.autoplay) player.loadVideoById(args);
  else player.cueVideoById(args);
}

/** Pops the head of the queue onto a record. Returns false if the queue is dry. */
export function loadNextInto(id: DeckId, opts: { autoplay?: boolean } = {}): boolean {
  const next = useMixer.getState().takeNextFromQueue();
  if (!next) return false;
  loadTrackToDeck(id, next, opts);
  return true;
}

export function ejectDeck(id: DeckId) {
  pause(id);
  useMixer.getState().setDeckTrack(id, null);
  players[id]?.stopVideo();
}

/**
 * Where a song you just picked should land.
 *
 * An empty record wins, so picking two songs in a row fills both instead of
 * the second one replacing the first. Otherwise it's the record you can't
 * hear, so a pick never interrupts what's playing.
 */
export function landingDeck(): DeckId {
  const { decks, crossfader } = useMixer.getState();
  const quiet: DeckId = crossfader <= 0.5 ? "B" : "A";
  if (!decks[quiet].track) return quiet;
  const loud = otherDeck(quiet);
  return decks[loud].track ? quiet : loud;
}

/* --------------------------------------------------------------- mixes -- */

let fadeFrame = 0;

/**
 * Animates the fader toward `to` over `seconds`. The position is interpolated
 * linearly and the equal-power curve is applied on top, which is how a
 * motorised hardware fader behaves.
 */
export function startFade(to: DeckId, seconds = FADE_SECONDS) {
  const store = useMixer.getState();
  const duration = Math.max(0.1, seconds);
  const from = store.crossfader;
  const target = to === "A" ? 0 : 1;

  cancelAnimationFrame(fadeFrame);

  if (store.decks[to].track) play(to);

  if (Math.abs(target - from) < 0.001) {
    store.setFading(null);
    return;
  }

  store.setFading({ to });
  const startedAt = performance.now();

  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / (duration * 1000));
    useMixer.getState().setCrossfader(from + (target - from) * progress);
    applyGains();

    if (progress < 1) {
      fadeFrame = requestAnimationFrame(step);
      return;
    }
    finishFade(to);
  };

  fadeFrame = requestAnimationFrame(step);
}

export function cancelFade() {
  cancelAnimationFrame(fadeFrame);
  useMixer.getState().setFading(null);
}

function finishFade(to: DeckId) {
  const store = useMixer.getState();
  store.setFading(null);

  const faded = otherDeck(to);
  if (!store.decks[faded].track) return;

  // The outgoing record is silent now. Park it so it isn't burning through a
  // song nobody can hear; mixing back resumes it in place.
  pause(faded);

  // Auto mode owns the quiet record, so recycle it straight away. In manual
  // mode the record stays on, because mixing back has to still work.
  if (store.autoDJ) {
    ejectDeck(faded);
    loadNextInto(faded, { autoplay: false });
  }
}

/** The one big button: take the music to the other record. */
export function mix() {
  const store = useMixer.getState();
  if (store.fading) {
    cancelFade();
    return;
  }
  startFade(store.crossfader <= 0.5 ? "B" : "A");
}

/* ------------------------------------------------------------ run loop -- */

const TICK_MS = 100;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

function tick() {
  const store = useMixer.getState();

  for (const id of DECK_IDS) {
    const player = players[id];
    const deck = store.decks[id];
    if (!player || !deck.track) continue;

    let position: number;
    let duration: number;
    try {
      position = player.getCurrentTime() ?? 0;
      duration = player.getDuration() ?? 0;
    } catch {
      continue;
    }

    // Only write when it matters: this runs 10x a second.
    if (Math.abs(position - deck.position) > 0.04 || Math.abs(duration - deck.duration) > 0.5) {
      store.patchDeck(id, { position, duration });
    }
  }

  maybeAutoTransition();
}

function maybeAutoTransition() {
  const store = useMixer.getState();
  if (!store.autoDJ || store.fading) return;

  const live: DeckId = store.crossfader <= 0.5 ? "A" : "B";
  const idle = otherDeck(live);

  // Cold start: nothing under the fader, so open the set on the live record.
  if (!store.decks[live].track) {
    loadNextInto(live, { autoplay: true });
    return;
  }

  // Keep the quiet record stocked so a mix always has somewhere to land.
  if (!store.decks[idle].track && store.queue.length > 0) {
    loadNextInto(idle, { autoplay: false });
  }

  const deck = useMixer.getState().decks[live];
  if (!deck.playing || deck.duration <= 0) return;
  if (!useMixer.getState().decks[idle].track) return; // Queue is dry; play it out.

  const remaining = deck.duration - deck.position;
  if (remaining > FADE_SECONDS) return;

  startFade(idle, Math.max(0.5, Math.min(FADE_SECONDS, remaining)));
}

export function startEngine() {
  if (tickTimer) return () => {};

  tickTimer = setInterval(tick, TICK_MS);
  unsubscribe = useMixer.subscribe(() => applyGains());

  return () => {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
    unsubscribe?.();
    unsubscribe = null;
    cancelAnimationFrame(fadeFrame);
  };
}

/* ------------------------------------------------- player event bridge -- */

export function handlePlayerStateChange(id: DeckId, state: number) {
  const store = useMixer.getState();

  switch (state) {
    case PlayerState.PLAYING:
      store.patchDeck(id, { playing: true, buffering: false });
      applyGains(true);
      break;
    case PlayerState.BUFFERING:
      store.patchDeck(id, { buffering: true });
      break;
    case PlayerState.PAUSED:
    case PlayerState.ENDED:
    case PlayerState.CUED:
      store.patchDeck(id, { playing: false, buffering: false });
      break;
  }
}
