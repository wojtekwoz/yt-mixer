"use client";

import { useState, type ClipboardEvent } from "react";
import Image from "next/image";
import { useMixer, trackFromLink, type Track } from "@/lib/store";
import { landingDeck, loadTrackToDeck } from "@/lib/engine";
import { hydrateTrackMeta } from "@/lib/meta";
import { parseManyLinks } from "@/lib/youtube";

/**
 * Add songs, and see what's coming.
 *
 * Row actions are always visible rather than revealed on hover: this is used on
 * tablets, where hover does not exist.
 */
export function UpNext() {
  const queue = useMixer((s) => s.queue);
  const enqueue = useMixer((s) => s.enqueue);
  const removeFromQueue = useMixer((s) => s.removeFromQueue);

  const [input, setInput] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const addLinks = (text: string): boolean => {
    const links = parseManyLinks(text);
    if (links.length === 0) return false;
    const tracks = links.map((link) => trackFromLink(link));
    enqueue(tracks);
    tracks.forEach(hydrateTrackMeta);
    setInput("");
    setProblem(null);
    return true;
  };

  const add = () => {
    if (!addLinks(input)) setProblem("That's not a YouTube link.");
  };

  /**
   * A single-line input strips newlines from `value`, which would silently
   * mash a multi-line paste into one broken entry. Read the clipboard directly
   * so pasting a list still adds every song in it.
   */
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    const links = parseManyLinks(text);
    if (links.length < 2) return;
    event.preventDefault();
    addLinks(text);
  };

  return (
    <section aria-label="Songs" className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="url"
          value={input}
          placeholder="Paste a YouTube link"
          aria-label="Paste a YouTube link"
          onChange={(event) => {
            setInput(event.target.value);
            setProblem(null);
          }}
          onPaste={onPaste}
          onKeyDown={(event) => event.key === "Enter" && add()}
          className="h-16 min-w-0 flex-1 rounded-3xl bg-surface px-5 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-3 focus-visible:outline-go-deep"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add song"
          className="key grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-go text-3xl font-bold text-ink"
        >
          +
        </button>
      </div>

      {problem && <p className="text-sm text-ink-soft">{problem}</p>}

      {queue.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          Copy a link from YouTube and paste it above. Songs you add wait here for their turn.
        </p>
      ) : (
        <ul className="flex list-none gap-3 overflow-x-auto pb-2">
          {queue.map((track) => (
            <QueueCard key={track.id} track={track} onRemove={removeFromQueue} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueCard({ track, onRemove }: { track: Track; onRemove: (id: string) => void }) {
  return (
    <li className="relative w-28 shrink-0">
      <button
        type="button"
        onClick={() => {
          loadTrackToDeck(landingDeck(), track, { autoplay: false });
          onRemove(track.id);
        }}
        className="w-full text-left"
        aria-label={`Put ${track.title ?? "this song"} on a record`}
      >
        <Image
          src={track.thumbnail}
          alt=""
          width={112}
          height={112}
          unoptimized
          className="h-28 w-28 rounded-2xl object-cover"
        />
        <span className="mt-1.5 line-clamp-2 block text-xs leading-tight text-ink">
          {track.title ?? "…"}
        </span>
        {track.requestedBy && (
          <span className="block truncate text-xs text-ink-soft">{track.requestedBy}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onRemove(track.id)}
        aria-label={`Remove ${track.title ?? "this song"}`}
        className="absolute right-0 top-0 grid h-12 w-12 place-items-center rounded-full text-base text-bg"
      >
        {/* 44px hit area, smaller visible dot: touch targets shouldn't have to
            look as big as they need to be. */}
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/75">✕</span>
      </button>
    </li>
  );
}
