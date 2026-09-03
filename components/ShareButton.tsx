"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { hostPost, useHostSession, useSessionFeed } from "@/lib/session-client";
import { sessionPath, type SongRequest } from "@/lib/session";
import { useMixer, type Track } from "@/lib/store";
import { thumbnailFor } from "@/lib/youtube";

/**
 * Everything to do with sharing lives behind this one button.
 *
 * Opening a session, handing out the link and judging requests is the parent's
 * job, not the player's, so it stays off the play surface entirely. The only
 * thing that leaks out is a count, because a request nobody sees is a request
 * that never happened.
 */
export function ShareButton() {
  const { code, hostToken, setSession, clearSession } = useHostSession();
  const { snapshot, status } = useSessionFeed(code, null, { role: "host" });
  const enqueue = useMixer((s) => s.enqueue);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const pending = snapshot?.requests.filter((r) => r.status === "pending") ?? [];
  const dead = status === "missing";
  const shareUrl =
    code && typeof window !== "undefined" ? `${window.location.origin}${sessionPath(code)}` : "";

  const start = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Party" }),
      });
      if (response.ok) {
        setSession((await response.json()) as { code: string; name: string; hostToken: string });
      }
    } finally {
      setBusy(false);
    }
  };

  const decide = async (request: SongRequest, action: "accept" | "decline") => {
    if (!code || !hostToken) return;
    const result = await hostPost(`/api/session/${code}/requests/${request.id}`, hostToken, {
      action,
    });
    if (!result.ok || action !== "accept") return;

    // Enqueued here rather than off the feed: only the host accepts, so this
    // fires exactly once and a stream reconnect can't duplicate the song.
    const track: Track = {
      id: request.id,
      videoId: request.videoId,
      title: request.title,
      author: request.author,
      thumbnail: thumbnailFor(request.videoId),
      cueIn: request.start,
      requestedBy: request.nickname,
    };
    enqueue([track]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="relative h-12 rounded-full bg-surface px-5 text-sm font-semibold text-ink"
      >
        Share
        {pending.length > 0 && (
          <span
            className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-go px-1.5 text-xs font-bold text-ink"
            aria-label={`${pending.length} waiting`}
          >
            {pending.length}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          // Backdrop clicks land on the dialog itself, not its content.
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-[1.75rem] bg-bg p-6 text-ink backdrop:bg-ink/45"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">Play together</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="grid h-11 w-11 place-items-center rounded-full bg-surface text-lg"
            >
              ✕
            </button>
          </div>

          {!code || dead ? (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">
                Get a link to send your friends. They can pick songs, and you decide which ones
                get played.
              </p>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="key h-16 rounded-3xl bg-go text-lg font-extrabold text-ink"
              >
                {busy ? "…" : "Make a link"}
              </button>
              {dead && (
                <p className="text-sm text-ink-soft">
                  Your old link stopped working. Make a new one.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="rounded-3xl bg-surface p-4">
                <p className="break-all text-sm text-ink">{shareUrl}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="key mt-3 h-14 w-full rounded-2xl bg-go text-base font-extrabold text-ink"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>

              {pending.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  No song requests yet. {snapshot?.listeners ?? 0} here now.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-3">
                  {pending.map((request) => (
                    <li key={request.id} className="flex items-center gap-3">
                      <Image
                        src={thumbnailFor(request.videoId)}
                        alt=""
                        width={64}
                        height={64}
                        unoptimized
                        className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm leading-tight">
                          {request.title ?? "A song"}
                        </p>
                        <p className="truncate text-xs text-ink-soft">{request.nickname}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => decide(request, "accept")}
                        aria-label={`Add ${request.title ?? "this song"}`}
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-go text-2xl text-ink"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(request, "decline")}
                        aria-label={`Skip ${request.title ?? "this song"}`}
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-2xl text-ink"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={clearSession}
                className="self-start text-sm text-ink-soft underline underline-offset-4"
              >
                Stop sharing
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
