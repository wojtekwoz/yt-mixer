import { NextResponse } from "next/server";
import { getSession, isHost, setRequestStatus } from "@/lib/server/session-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** Host-only: accept a request into the set, or wave it off. */
export async function POST(request: Request, { params }: Ctx) {
  const { code, id } = await params;
  const session = getSession(code);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (!isHost(session, request.headers.get("x-dj-token"))) {
    return NextResponse.json({ error: "Not the host of this session" }, { status: 403 });
  }

  const { action } = (await request.json()) as { action?: "accept" | "decline" };
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  }

  const updated = setRequestStatus(session, id, action === "accept" ? "accepted" : "declined");
  if (!updated) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json({ request: updated });
}
