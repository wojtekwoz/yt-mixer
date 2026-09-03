"use client";

import { useEffect, useRef } from "react";
import { useHostSession } from "@/lib/session-client";
import { useMixer } from "@/lib/store";

/**
 * Pushes what the room is hearing to the session feed.
 *
 * Rendered as its own null component so its re-renders never reach the console
 * tree, and subscribed to the live *track* rather than the deck, so the
 * 10 Hz playhead updates don't churn it.
 */
export function NowPlayingPublisher() {
  const code = useHostSession((s) => s.code);
  const hostToken = useHostSession((s) => s.hostToken);

  const liveTrack = useMixer((s) => s.decks[s.crossfader <= 0.5 ? "A" : "B"].track);
  const queue = useMixer((s) => s.queue);
  const lastSent = useRef("");

  useEffect(() => {
    if (!code || !hostToken) return;

    const payload = {
      nowPlaying: liveTrack
        ? {
            videoId: liveTrack.videoId,
            title: liveTrack.title,
            author: liveTrack.author,
            requestedBy: liveTrack.requestedBy,
          }
        : null,
      upNext: queue.slice(0, 5).map((t) => ({ title: t.title, author: t.author })),
    };

    const key = JSON.stringify(payload);
    if (key === lastSent.current) return;
    lastSent.current = key;

    fetch(`/api/session/${code}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-dj-token": hostToken },
      body: key,
    }).catch(() => {
      // Let the next change retry; the crowd view is non-critical.
      lastSent.current = "";
    });
  }, [code, hostToken, liveTrack, queue]);

  return null;
}
