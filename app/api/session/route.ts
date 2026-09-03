import { NextResponse } from "next/server";
import { createSession } from "@/lib/server/session-store";

export const dynamic = "force-dynamic";

/** Opens a live session and hands the host its private token exactly once. */
export async function POST(request: Request) {
  let name = "";
  try {
    const body = (await request.json()) as { name?: string };
    name = body.name ?? "";
  } catch {
    // An empty body is fine; the store supplies a default name.
  }

  const session = createSession(name);
  return NextResponse.json({
    code: session.code,
    name: session.name,
    hostToken: session.hostToken,
  });
}
