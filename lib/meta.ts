"use client";

import { useMixer, type Track } from "./store";

const inFlight = new Set<string>();

/** Fills in title/author for freshly queued tracks, one request per video. */
export async function hydrateTrackMeta(track: Track) {
  if (track.title || inFlight.has(track.videoId)) return;
  inFlight.add(track.videoId);

  try {
    const response = await fetch(`/api/meta?v=${track.videoId}`);
    if (!response.ok) return;
    const data = (await response.json()) as { title: string | null; author: string | null };
    if (!data.title) return;

    // The same video may sit in several queue slots; patch every one of them.
    const { queue, decks, updateTrack } = useMixer.getState();
    const targets = [
      ...queue.filter((t) => t.videoId === track.videoId),
      ...Object.values(decks).flatMap((d) => (d.track?.videoId === track.videoId ? [d.track] : [])),
    ];
    for (const t of targets) updateTrack(t.id, { title: data.title, author: data.author });
  } catch {
    // Titles are cosmetic; the deck plays fine without them.
  } finally {
    inFlight.delete(track.videoId);
  }
}
