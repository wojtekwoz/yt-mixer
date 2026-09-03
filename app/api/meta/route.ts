import { NextResponse } from "next/server";
import { fetchVideoMeta } from "@/lib/server/oembed";

/**
 * Title/author lookup, proxied server-side: YouTube's oEmbed endpoint sends no
 * CORS headers, and going through the server keeps the client key-free.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("v")?.trim() ?? "";
  if (!ID.test(videoId)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }
  const meta = await fetchVideoMeta(videoId);
  return NextResponse.json({ videoId, ...meta });
}
