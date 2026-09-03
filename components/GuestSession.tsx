"use client";

import { useState } from "react";
import Image from "next/image";
import { useGuestNickname, useSessionFeed } from "@/lib/session-client";
import { NICKNAME_MAX, normalizeNickname, type SongRequest } from "@/lib/session";
import { parseYouTubeUrl, thumbnailFor } from "@/lib/youtube";

const STATUS_LABEL: Record<SongRequest["status"], string> = {
  pending: "Waiting",
  accepted: "Playing soon",
  declined: "Not this time",
};

/** The page a guest lands on. One job: send the DJ a song. */
export function GuestSession({ code }: { code: string }) {
  const { nickname, setNickname, loaded } = useGuestNickname(code);
  const { snapshot, status } = useSessionFeed(code, nickname);

  if (!loaded) return <Shell>{null}</Shell>;

  if (status === "missing") {
    return (
      <Shell>
        <p className="text-lg font-bold">This party is over.</p>
        <p className="text-sm text-ink-soft">Ask your friend for a new link.</p>
      </Shell>
    );
  }

  if (!nickname) return <Shell><NameGate onJoin={setNickname} /></Shell>;

  const nowPlaying = snapshot?.nowPlaying ?? null;

  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-ink-soft">Playing now</p>
        {nowPlaying ? (
          <div className="flex items-center gap-4">
            <Image
              src={thumbnailFor(nowPlaying.videoId)}
              alt=""
              width={80}
              height={80}
              unoptimized
              className="h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
            <p className="min-w-0 text-base font-medium leading-tight">
              {nowPlaying.title ?? "A song"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Nothing yet.</p>
        )}
      </div>

      <RequestForm code={code} nickname={nickname} />

      {(snapshot?.yours.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-ink-soft">Your songs</p>
          <ul className="flex list-none flex-col gap-3">
            {[...(snapshot?.yours ?? [])].reverse().map((request) => (
              <li key={request.id} className="flex items-center gap-3">
                <Image
                  src={thumbnailFor(request.videoId)}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
                <p className="min-w-0 flex-1 line-clamp-2 text-sm leading-tight">
                  {request.title ?? "A song"}
                </p>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    request.status === "accepted" ? "bg-go text-ink" : "bg-surface text-ink-soft"
                  }`}
                >
                  {STATUS_LABEL[request.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setNickname(null)}
        className="self-start text-sm text-ink-soft underline underline-offset-4"
      >
        Not {nickname}?
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-7 px-5 pb-10 pt-8">
      <h1 className="text-base font-extrabold tracking-tight">yt mixer</h1>
      {children}
    </div>
  );
}

function NameGate({ onJoin }: { onJoin: (nickname: string) => void }) {
  const [value, setValue] = useState("");
  const clean = normalizeNickname(value);

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="nickname" className="text-2xl font-extrabold tracking-tight">
        What&apos;s your name?
      </label>
      <input
        id="nickname"
        type="text"
        autoFocus
        maxLength={NICKNAME_MAX}
        value={value}
        placeholder="Type it here"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && clean.length >= 2 && onJoin(clean)}
        className="h-16 rounded-3xl bg-surface px-5 text-lg text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-3 focus-visible:outline-go-deep"
      />
      <button
        type="button"
        disabled={clean.length < 2}
        onClick={() => onJoin(clean)}
        className="key h-16 rounded-3xl bg-go text-lg font-extrabold text-ink disabled:bg-surface disabled:text-ink-soft"
      >
        Let me in
      </button>
    </div>
  );
}

function RequestForm({ code, nickname }: { code: string; nickname: string }) {
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    if (!parseYouTubeUrl(url)) {
      setNote("That's not a YouTube link.");
      return;
    }
    setSending(true);
    setNote(null);
    try {
      const response = await fetch(`/api/session/${code}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, nickname }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNote(data.error ?? "That didn't send.");
        return;
      }
      setUrl("");
      setNote("Sent!");
    } catch {
      setNote("That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="song" className="text-2xl font-extrabold tracking-tight">
        Send a song
      </label>
      <input
        id="song"
        type="text"
        inputMode="url"
        value={url}
        placeholder="Paste a YouTube link"
        onChange={(event) => {
          setUrl(event.target.value);
          setNote(null);
        }}
        onKeyDown={(event) => event.key === "Enter" && !sending && submit()}
        className="h-16 rounded-3xl bg-surface px-5 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-3 focus-visible:outline-go-deep"
      />
      <button
        type="button"
        onClick={submit}
        disabled={sending || url.trim().length === 0}
        className="key h-16 rounded-3xl bg-go text-lg font-extrabold text-ink disabled:bg-surface disabled:text-ink-soft"
      >
        {sending ? "…" : "Send"}
      </button>
      {note && <p className="text-sm text-ink-soft">{note}</p>}
    </div>
  );
}
