import { NextResponse } from "next/server";
import { addRequest, getSession, snapshot } from "@/lib/server/session-store";
import { normalizeNickname } from "@/lib/session";
import { fetchVideoMeta } from "@/lib/server/oembed";
import { parseYouTubeUrl } from "@/lib/youtube";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Guest-facing: submit a link for the DJ to consider. */
export async function POST(request: Request, { params }: Ctx) {
  const { code } = await params;
  const session = getSession(code);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let body: { url?: string; nickname?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const nickname = normalizeNickname(body.nickname ?? "");
  if (nickname.length < 2) {
    return NextResponse.json({ error: "Pick a nickname first." }, { status: 400 });
  }

  const link = parseYouTubeUrl(body.url ?? "");
  if (!link) {
    return NextResponse.json({ error: "That doesn't look like a YouTube link." }, { status: 400 });
  }

  const meta = await fetchVideoMeta(link.videoId);
  const result = addRequest(session, {
    videoId: link.videoId,
    start: link.start,
    nickname,
    title: meta.title,
    author: meta.author,
  });

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });

  return NextResponse.json({ request: result.request, session: snapshot(session, nickname) });
}
