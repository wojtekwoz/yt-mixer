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

**One slider.** Drag it and the music moves from one record to the other. The
record you hear grows and brightens; the other shrinks and dims. The knob sits
under whichever record is loud. No labels, no numbers, no reading.

**Mix.** The big button does that fade for you, over 8 seconds. Tap it again
mid-fade to stop.

**Auto.** Turn it on and songs play one after another: it pulls from the queue,
keeps the quiet record loaded, and mixes into it as each song ends.

**Songs.** Paste a YouTube link and press `+`. Paste a whole list at once and it
adds every one. Tap a song to put it on a free record; tap the ✕ to bin it. A
`?t=90` in a link becomes that song's start point.

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

YouTube plays in a cross-origin iframe. The page cannot reach the audio stream,
so **there is no EQ, filter, waveform or BPM detection, and none is possible**
through the IFrame API. What it exposes is volume, seek, playback rate and time —
so a mix here is an equal-power volume blend between two players. That is also
why the crossfade is drawn as size: it is the honest picture of what is happening.

Both players are created once at startup and never destroyed; tracks are swapped
in with `loadVideoById`. That is what lets an unattended Auto mix start playback
without tripping the browser's autoplay-gesture policy.

## Session storage

Sessions live in memory in the Next.js server process
(`lib/server/session-store.ts`), fanned out to browsers over SSE. That fits an
ephemeral, single-host party and needs no database or credentials, but sessions
do not survive a server restart and will not work across more than one server
instance.

To change that, reimplement that one module against Convex, Redis, or Postgres —
`createSession`, `getSession`, `addRequest`, `setRequestStatus`, `setNowPlaying`,
`subscribe`, `snapshot`. Nothing outside the file needs to change.

The host token is generated server-side and kept in the host's `localStorage`; it
gates accepting requests and publishing now-playing. Nicknames are labels, not
authentication — anyone can claim one.

## Design

`PRODUCT.md` holds the strategy (who it's for, the one job, the principles).
`DESIGN.md` holds the visual system (tokens, type, shape, motion). Both are short
and both are current.
