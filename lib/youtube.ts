/**
 * YouTube URL parsing + IFrame Player API loading.
 *
 * The IFrame API is the only way to play YouTube in a browser. It hands us a
 * cross-origin iframe, so the audio stream is unreachable: no Web Audio graph,
 * no analyser, no EQ. Everything the mixer does is built on the handful of
 * imperative controls below.
 */

export type YTPlayer = {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { video_id: string; title: string; author: string };
  destroy(): void;
};

/** YT.PlayerState mirrored so we don't reach through `window` at call sites. */
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts `90`, `1m30s`, `2h5m`, `1:30`, `1:02:03`. */
export function parseTimeParam(raw: string | null | undefined): number {
  if (!raw) return 0;
  const v = raw.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10);

  if (v.includes(":")) {
    const parts = v.split(":").map((p) => parseInt(p, 10));
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
}

export type ParsedLink = { videoId: string; start: number };

/**
 * Handles watch?v=, youtu.be, /shorts/, /embed/, /live/, /v/, music.youtube,
 * and a bare 11-character video id.
 */
export function parseYouTubeUrl(input: string): ParsedLink | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID.test(raw)) return { videoId: raw, start: 0 };

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const start =
    parseTimeParam(url.searchParams.get("t")) ||
    parseTimeParam(url.searchParams.get("start")) ||
    parseTimeParam(url.hash.startsWith("#t=") ? url.hash.slice(3) : null);

  const fromPath = (prefix: string) => {
    const seg = url.pathname.split("/").filter(Boolean);
    const i = seg.indexOf(prefix);
    return i >= 0 ? seg[i + 1] : undefined;
  };

  let videoId: string | undefined;
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0];
  } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    videoId =
      url.searchParams.get("v") ??
      fromPath("shorts") ??
      fromPath("embed") ??
      fromPath("live") ??
      fromPath("v");
  }

  if (!videoId || !ID.test(videoId)) return null;
  return { videoId, start };
}

/** Pulls every distinct video id out of a blob of pasted text. */
export function parseManyLinks(text: string): ParsedLink[] {
  const out: ParsedLink[] = [];
  const seen = new Set<string>();
  const tokens = text.split(/[\s,]+/).filter(Boolean);

  for (const token of tokens) {
    const parsed = parseYouTubeUrl(token);
    if (!parsed) continue;
    // Same video queued twice from one paste is nearly always an accident.
    const key = `${parsed.videoId}@${parsed.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}



type YTNamespace = { Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer };

let apiPromise: Promise<YTNamespace> | null = null;

/** Idempotent loader for https://www.youtube.com/iframe_api. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadYouTubeApi called outside the browser"));
      return;
    }

    const w = window as unknown as {
      YT?: YTNamespace;
      onYouTubeIframeAPIReady?: () => void;
    };

    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }

    // Chain rather than clobber: another script may already be waiting.
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YTNamespace);
    };

    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.ytIframeApi = "true";
      script.onerror = () => reject(new Error("Failed to load the YouTube IFrame API"));
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
