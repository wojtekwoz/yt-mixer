import { randomUUID, randomInt, timingSafeEqual } from "node:crypto";
import {
  MAX_PENDING_PER_GUEST,
  MAX_REQUESTS_PER_SESSION,
  type NowPlaying,
  type SessionSnapshot,
  type SongRequest,
} from "@/lib/session";

/**
 * Live-session storage.
 *
 * This is deliberately a single narrow interface with an in-process
 * implementation: a DJ set is ephemeral and single-host, so a Map plus a
 * fan-out set of listeners is the right amount of machinery, and it runs with
 * no credentials or provisioning. Swap `store` below for a Convex/Redis-backed
 * implementation of the same interface to survive restarts or run on more than
 * one server instance — nothing outside this file needs to change.
 */

export type Session = {
  code: string;
  name: string;
  hostToken: string;
  createdAt: number;
  nowPlaying: NowPlaying;
  upNext: { title: string | null; author: string | null }[];
  requests: SongRequest[];
  listeners: Set<Listener>;
};

/** A connected stream. `counts` is false for the DJ's own console. */
export type Listener = { push: () => void; counts: boolean };

// Ambiguous glyphs removed: these codes get read aloud and typed on phones.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Pinned to globalThis so the Next dev server's module reloading doesn't drop
// every live session on each edit.
const globalForSessions = globalThis as unknown as { __ytMixerSessions?: Map<string, Session> };
const sessions = (globalForSessions.__ytMixerSessions ??= new Map<string, Session>());

function newCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  } while (sessions.has(code));
  return code;
}

function sweep() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [code, session] of sessions) {
    if (session.createdAt < cutoff && session.listeners.size === 0) sessions.delete(code);
  }
}

function notify(session: Session) {
  for (const listener of session.listeners) listener.push();
}

/** People in the room. The host's own console stream is excluded. */
function audienceSize(session: Session): number {
  let count = 0;
  for (const listener of session.listeners) if (listener.counts) count += 1;
  return count;
}

export function createSession(name: string): Session {
  sweep();
  const session: Session = {
    code: newCode(),
    name: name.trim().slice(0, 60) || "Party",
    hostToken: randomUUID(),
    createdAt: Date.now(),
    nowPlaying: null,
    upNext: [],
    requests: [],
    listeners: new Set<Listener>(),
  };
  sessions.set(session.code, session);
  return session;
}

export function getSession(code: string): Session | null {
  return sessions.get(code.toUpperCase()) ?? null;
}

/** Constant-time compare so a token can't be probed byte by byte. */
export function isHost(session: Session, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(session.hostToken);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AddRequestResult =
  | { ok: true; request: SongRequest }
  | { ok: false; reason: string };

export function addRequest(
  session: Session,
  input: { videoId: string; start: number; nickname: string; title: string | null; author: string | null },
): AddRequestResult {
  if (session.requests.length >= MAX_REQUESTS_PER_SESSION) {
    return { ok: false, reason: "This session has hit its request limit." };
  }

  const pending = session.requests.filter(
    (r) => r.nickname === input.nickname && r.status === "pending",
  );
  if (pending.length >= MAX_PENDING_PER_GUEST) {
    return {
      ok: false,
      reason: `You already have ${MAX_PENDING_PER_GUEST} requests waiting. Let the DJ catch up.`,
    };
  }

  const duplicate = session.requests.find(
    (r) => r.videoId === input.videoId && r.status !== "declined",
  );
  if (duplicate) {
    return {
      ok: false,
      reason:
        duplicate.status === "accepted"
          ? "That track is already in the DJ's queue."
          : `${duplicate.nickname} already requested that one.`,
    };
  }

  const request: SongRequest = {
    id: randomUUID(),
    videoId: input.videoId,
    start: input.start,
    title: input.title,
    author: input.author,
    nickname: input.nickname,
    createdAt: Date.now(),
    status: "pending",
  };

  session.requests.push(request);
  notify(session);
  return { ok: true, request };
}

export function setRequestStatus(
  session: Session,
  id: string,
  status: "accepted" | "declined",
): SongRequest | null {
  const request = session.requests.find((r) => r.id === id);
  if (!request) return null;
  request.status = status;
  notify(session);
  return request;
}

export function setNowPlaying(
  session: Session,
  nowPlaying: NowPlaying,
  upNext: { title: string | null; author: string | null }[],
) {
  session.nowPlaying = nowPlaying;
  session.upNext = upNext.slice(0, 5);
  notify(session);
}

export function subscribe(session: Session, listener: Listener): () => void {
  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}

/** Public view. Declined requests only ever go back to the guest who made them. */
export function snapshot(session: Session, nickname: string | null): SessionSnapshot {
  return {
    code: session.code,
    name: session.name,
    createdAt: session.createdAt,
    nowPlaying: session.nowPlaying,
    upNext: session.upNext,
    requests: session.requests.filter((r) => r.status !== "declined"),
    yours: nickname ? session.requests.filter((r) => r.nickname === nickname) : [],
    listeners: audienceSize(session),
  };
}
