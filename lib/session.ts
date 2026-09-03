/** Types and helpers shared by the DJ console, the guest page, and the API. */

export type RequestStatus = "pending" | "accepted" | "declined";

export type SongRequest = {
  id: string;
  videoId: string;
  /** Start offset carried over from a `?t=` in the submitted link. */
  start: number;
  title: string | null;
  author: string | null;
  nickname: string;
  createdAt: number;
  status: RequestStatus;
};

export type NowPlaying = {
  videoId: string;
  title: string | null;
  author: string | null;
  requestedBy?: string;
} | null;

/** What any visitor to a session link is allowed to see. */
export type SessionSnapshot = {
  code: string;
  name: string;
  createdAt: number;
  nowPlaying: NowPlaying;
  upNext: { title: string | null; author: string | null }[];
  /** Pending and accepted requests. Declines are only sent to their author. */
  requests: SongRequest[];
  /** Every request made under the nickname in the query string. */
  yours: SongRequest[];
  listeners: number;
};

export const NICKNAME_MAX = 24;
export const MAX_PENDING_PER_GUEST = 5;
export const MAX_REQUESTS_PER_SESSION = 300;

export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, NICKNAME_MAX);
}

export function sessionPath(code: string): string {
  return `/s/${code}`;
}
