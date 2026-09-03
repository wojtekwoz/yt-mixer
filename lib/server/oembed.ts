/** Shared title/author lookup with a process-wide cache. */

export type VideoMeta = { title: string | null; author: string | null };

const globalForCache = globalThis as unknown as { __ytMixerMeta?: Map<string, VideoMeta> };
const cache = (globalForCache.__ytMixerMeta ??= new Map<string, VideoMeta>());

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const hit = cache.get(videoId);
  if (hit) return hit;

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}`,
      { signal: AbortSignal.timeout(6000) },
    );
    // A non-200 means private, deleted, or embedding disabled. The player is
    // the authority on playability, so this only costs us a nice title.
    if (!response.ok) return { title: null, author: null };

    const data = (await response.json()) as { title?: string; author_name?: string };
    const meta: VideoMeta = { title: data.title ?? null, author: data.author_name ?? null };
    if (meta.title) cache.set(videoId, meta);
    return meta;
  } catch {
    return { title: null, author: null };
  }
}
