"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionSnapshot } from "./session";

/** The host's private handle on a session it created. Never leaves this device. */
type HostSessionState = {
  code: string | null;
  name: string | null;
  hostToken: string | null;
  setSession: (value: { code: string; name: string; hostToken: string }) => void;
  clearSession: () => void;
};

export const useHostSession = create<HostSessionState>()(
  persist(
    (set) => ({
      code: null,
      name: null,
      hostToken: null,
      setSession: (value) => set(value),
      clearSession: () => set({ code: null, name: null, hostToken: null }),
    }),
    { name: "yt-mixer-host" },
  ),
);

export type FeedStatus = "idle" | "connecting" | "live" | "missing" | "reconnecting";

/**
 * Subscribes to a session's SSE feed.
 *
 * A one-shot fetch runs first so a bad code fails fast — EventSource treats a
 * 404 as a transient error and would otherwise retry it forever.
 */
export function useSessionFeed(
  code: string | null,
  nickname: string | null,
  options: { role?: "host" | "guest" } = {},
) {
  const role = options.role ?? "guest";
  const [feed, setFeed] = useState<{ snapshot: SessionSnapshot | null; status: FeedStatus }>({
    snapshot: null,
    status: code ? "connecting" : "idle",
  });
  const everConnected = useRef(false);

  // Reset during render rather than in an effect: switching sessions must not
  // leave the previous room's snapshot on screen for a frame.
  const [renderedCode, setRenderedCode] = useState(code);
  if (renderedCode !== code) {
    setRenderedCode(code);
    setFeed({ snapshot: null, status: code ? "connecting" : "idle" });
  }

  useEffect(() => {
    if (!code) return;

    let disposed = false;
    let source: EventSource | null = null;
    everConnected.current = false;

    const params = new URLSearchParams();
    if (nickname) params.set("nickname", nickname);
    if (role === "host") params.set("role", "host");
    const query = params.size > 0 ? `?${params}` : "";

    (async () => {
      try {
        const probe = await fetch(`/api/session/${code}${query}`);
        if (disposed) return;
        if (probe.status === 404) {
          setFeed({ snapshot: null, status: "missing" });
          return;
        }
        if (probe.ok) {
          const snapshot = (await probe.json()) as SessionSnapshot;
          if (!disposed) setFeed({ snapshot, status: "connecting" });
        }
      } catch {
        // The stream below is the real connection; a failed probe isn't fatal.
      }

      if (disposed) return;

      source = new EventSource(`/api/session/${code}/stream${query}`);
      source.onmessage = (event) => {
        if (disposed) return;
        everConnected.current = true;
        setFeed({ snapshot: JSON.parse(event.data) as SessionSnapshot, status: "live" });
      };
      source.onerror = () => {
        if (disposed) return;
        // EventSource reconnects on its own; just reflect it in the UI.
        setFeed((current) => ({
          ...current,
          status: everConnected.current ? "reconnecting" : "connecting",
        }));
      };
    })();

    return () => {
      disposed = true;
      source?.close();
    };
  }, [code, nickname, role]);

  return feed;
}

/**
 * Nickname remembered per session code, so a refresh doesn't lose your name.
 *
 * Backed by useSyncExternalStore so the localStorage read happens at the right
 * point in the render cycle instead of as a post-hydration state flip.
 */
const nicknameListeners = new Set<() => void>();

function subscribeToNickname(onChange: () => void) {
  nicknameListeners.add(onChange);
  // `storage` fires for the *other* tabs; the local set notifies this one.
  window.addEventListener("storage", onChange);
  return () => {
    nicknameListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuestNickname(code: string) {
  const storageKey = `yt-mixer-guest:${code}`;

  const nickname = useSyncExternalStore(
    subscribeToNickname,
    () => window.localStorage.getItem(storageKey),
    () => null,
  );

  // Server render has no localStorage, so the first client paint must wait
  // before deciding whether to show the nickname gate.
  const loaded = useSyncExternalStore(
    subscribeToNickname,
    () => true,
    () => false,
  );

  const setNickname = useCallback(
    (value: string | null) => {
      if (value) window.localStorage.setItem(storageKey, value);
      else window.localStorage.removeItem(storageKey);
      for (const listener of nicknameListeners) listener();
    },
    [storageKey],
  );

  return { nickname, setNickname, loaded };
}

export async function hostPost(
  path: string,
  hostToken: string,
  body: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dj-token": hostToken },
    body: JSON.stringify(body),
  });
  if (response.ok) return { ok: true };
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? "Request failed" };
}
