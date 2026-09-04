# yt·mixer

A DJ toy for YouTube. Two records, one fat slider, and a queue you paste links
into. Built to be usable by a five-year-old.

```bash
pnpm install
pnpm dev
```

## How it works

**Two records.** Each one is a spinning vinyl disc with the live video as its
label. Tap a record to play or pause it. A record that is spinning is playing; a
record that is stopped shows a play triangle.

**One slider.** Drag the tongue and the music moves from one record to the
other. The record you hear grows and brightens; the other shrinks and dims. The
tongue sits under whichever record is loud. No labels, no numbers, no reading.

Dragging toward a parked record starts it — the tongue never slides into
silence. It does not wait for buffering the way Mix does, because freezing your
drag would feel broken; the record arrives as soon as it has spun up. A record
you drag away from keeps rolling silently, like a real deck.

**Mix.** The big button does that fade for you, over 8 seconds. Tap it again
mid-fade to stop.

**Auto.** Turn it on and songs play one after another: it pulls from the queue,
keeps the quiet record loaded, and mixes into it as each song ends.

**Songs.** Paste a YouTube link and press `+`. Paste a whole list at once and it
adds every one. Tap a song to put it on a free record; tap the ✕ to bin it. A
`?t=90` in a link becomes that song's start point.

**Hair.** The band of bars on top of the head. Tap `EAR OFF` to hand it this
tab's real sound: pick this tab in the picker and switch on "Also share tab
audio". The bars turn orange and are then a genuine FFT of what you're hearing.
Left off, they draw the mix from deck gains instead — honest, but not the audio.
Chrome and Edge only; Safari and Firefox can't capture tab audio.

**Share.** One button. It hands you a link; friends open it, pick a nickname, and
send you songs. You get ✓ / ✕ on each request, and a count on the button so you
never miss one.

Space runs a mix. That is the only keyboard shortcut.

## What was deliberately removed

This started as a full DJ console. Hot cues, loop lengths, tempo faders, channel
faders, master volume, ±5s nudge, cue-in editing, hard cut, adjustable fade time,
queue reordering and shuffle were all deleted — from the UI *and* the engine, so
there is no dead code behind the simpler screen. Sixty-odd controls became
twelve.

Volume is now the device's job. Fade time is fixed at 8 seconds. If you want any
of it back, it is a small amount of code, and `git log` has the originals.

## The one hard constraint

YouTube plays in a cross-origin iframe. The page cannot reach that audio stream,
so **there is no EQ, filter or BPM detection, and none is possible** through the
IFrame API. What it exposes is volume, seek, playback rate and time — so a mix
here is an equal-power volume blend between two players. That is also why the
crossfade is drawn as size: it is the honest picture of what is happening.

The visualiser is the one place that constraint can be worked around, and only
sideways: `getDisplayMedia({ audio: true })` captures the whole tab's output,
which can then go through an AnalyserNode. That is real audio, but it costs a
permission prompt and a sharing indicator, so it is opt-in and off by default.
`suppressLocalAudioPlayback` is explicitly false — the capture is a tap, so
turning the ear on never silences the room.

Both players are created once at startup and never destroyed; tracks are swapped
in with `loadVideoById`. That is what lets an unattended Auto mix start playback
without tripping the browser's autoplay-gesture policy.

## Session storage — known broken in production

Sessions live in memory in the server process (`lib/server/session-store.ts`),
fanned out over SSE. That works perfectly with `pnpm dev`, where there is one
process.

**It does not work on Vercel.** Each serverless instance has its own memory, so
a session created on one instance is invisible to every other one. Measured
against the live deployment: after a burst of concurrent traffic, **40 out of 40
reads of a freshly created session returned "not found"**, and now-playing was
visible on 0 of 10 reads after a successful write. In practice the host opens a
session, a friend opens the link, their request lands on a different instance,
and the page reports that the party is over.

The rest of the app is unaffected — records, fader, mix, queue and playback are
entirely client-side and work fine in production.

**The fix** is a shared datastore. `lib/server/session-store.ts` is the only file
that needs to change; it exposes `createSession`, `getSession`, `addRequest`,
`setRequestStatus`, `setNowPlaying`, `subscribe` and `snapshot`, and nothing
outside it touches session state. Provision Redis (Upstash via the Vercel
Marketplace has a free tier) and reimplement those seven functions against it,
with `subscribe` polling or using Redis pub/sub.

The host token is generated server-side and kept in the host's `localStorage`; it
gates accepting requests and publishing now-playing. Nicknames are labels, not
authentication — anyone can claim one.

## Design

`PRODUCT.md` holds the strategy (who it's for, the one job, the principles).
`DESIGN.md` holds the visual system (tokens, type, shape, motion). Both are short
and both are current.
