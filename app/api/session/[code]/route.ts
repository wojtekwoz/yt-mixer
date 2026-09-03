import { NextResponse } from "next/server";
import { getSession, isHost, setNowPlaying, snapshot } from "@/lib/server/session-store";
import { normalizeNickname, type NowPlaying } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  const session = getSession(code);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const nickname = new URL(request.url).searchParams.get("nickname");
  return NextResponse.json(snapshot(session, nickname ? normalizeNickname(nickname) : null));
}

/** Host-only: publishes what the crowd sees on the session page. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { code } = await params;
  const session = getSession(code);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (!isHost(session, request.headers.get("x-dj-token"))) {
    return NextResponse.json({ error: "Not the host of this session" }, { status: 403 });
  }

  const body = (await request.json()) as {
    nowPlaying?: NowPlaying;
    upNext?: { title: string | null; author: string | null }[];
  };

  setNowPlaying(session, body.nowPlaying ?? null, body.upNext ?? []);
  return NextResponse.json({ ok: true });
}
