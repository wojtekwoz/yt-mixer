import { getSession, snapshot, subscribe } from "@/lib/server/session-store";
import { normalizeNickname } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events feed for a session.
 *
 * SSE rather than websockets: the traffic is one-way (server → viewers), it
 * survives proxies that mangle upgrades, and the browser reconnects on its own.
 */
export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  const session = getSession(code);

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const url = new URL(request.url);
  const nicknameParam = url.searchParams.get("nickname");
  const nickname = nicknameParam ? normalizeNickname(nicknameParam) : null;
  // The DJ's own console holds a stream too; it isn't part of the crowd.
  const counts = url.searchParams.get("role") !== "host";

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      const push = () => send(`data: ${JSON.stringify(snapshot(session, nickname))}\n\n`);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the platform.
        }
      };

      // Subscribe first so the very first snapshot already includes this
      // connection in the listener count.
      unsubscribe = subscribe(session, { push, counts });
      push();
      // Comment frames keep intermediaries from reaping an idle connection.
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disables proxy buffering that would otherwise hold events back.
      "x-accel-buffering": "no",
    },
  });
}
