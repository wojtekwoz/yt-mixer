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

let fadeTimer: ReturnType<typeof setInterval> | null = null;
/** Tears down a pending "waiting for the incoming record" subscription. */
let abortPendingStart: (() => void) | null = null;

/** How long to wait for a cued record to start before mixing into it anyway. */
const START_TIMEOUT_MS = 6000;

/**
 * Fade tick. Deliberately a timer rather than requestAnimationFrame: browsers
 * pause rAF in background tabs, and a DJ hunting for the next song on another
 * tab would come back to a mix frozen half-way with both records at partial
 * volume. A timer keeps running (throttled to ~1s while hidden), and because
 * progress is read from the clock rather than counted in frames, a throttled
 * tick still lands the fader in exactly the right place.
 */
const FADE_TICK_MS = 33;

function stopFadeTimer() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
}

/**
 * Runs `then` once the record is genuinely making sound.
 *
 * A cued YouTube player needs a second or two to buffer after playVideo(), and
 * moving the fader during that window fades the outgoing track down into
 * silence — the mix becomes a gap. So: start both, wait for the incoming one,
 * and only then touch the volume.
 */
function whenAudible(id: DeckId, then: () => void) {
  const audible = () => {
    const deck = useMixer.getState().decks[id];
    return deck.playing && !deck.buffering;
  };

  if (audible()) {
    then();
    return;
  }

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    unsubscribe();
    clearTimeout(timer);
    abortPendingStart = null;
    then();
  };

  const unsubscribe = useMixer.subscribe(() => {
    if (audible()) settle();
  });
  // A stalled network must not leave the fader stuck forever.
  const timer = setTimeout(settle, START_TIMEOUT_MS);

  abortPendingStart = () => {
    settled = true;
    unsubscribe();
    clearTimeout(timer);
  };
}

/**
 * Animates the fader toward `to` over `seconds`. The position is interpolated
 * linearly and the equal-power curve is applied on top, which is how a
 * motorised hardware fader behaves.
 *
 * Both records play for the whole crossfade; the outgoing one is only parked
 * once it is already silent.
 */
export function startFade(to: DeckId, seconds = FADE_SECONDS) {
  const store = useMixer.getState();
  const duration = Math.max(0.1, seconds);
  const from = store.crossfader;
  const target = to === "A" ? 0 : 1;

  stopFadeTimer();
  abortPendingStart?.();
  abortPendingStart = null;

  if (Math.abs(target - from) < 0.001 || !store.decks[to].track) {
    store.setFading(null);
    return;
  }

  store.setFading({ to });

  const animate = () => {
    const startedAt = performance.now();

    stopFadeTimer();
    fadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (duration * 1000));
      useMixer.getState().setCrossfader(from + (target - from) * progress);
      applyGains();

      if (progress >= 1) {
        stopFadeTimer();
        finishFade(to);
      }
    }, FADE_TICK_MS);
  };

  play(to);
  whenAudible(to, animate);
}

export function cancelFade() {
  stopFadeTimer();
  abortPendingStart?.();
  abortPendingStart = null;
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
    stopFadeTimer();
    abortPendingStart?.();
    abortPendingStart = null;
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
