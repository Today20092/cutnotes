import handler from "@tanstack/react-start/server-entry";
import { handleMuxWebhook } from "@/server/revision-lifecycle";
import { runHourly } from "@/server/purge";

/** The address of a share page is a credential. */
async function withShareHeaders(request: Request) {
  const original = await handler.fetch(request);
  const response = new Response(original.body, original);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export default {
  scheduled: (controller) => runHourly(controller.scheduledTime),
  fetch: (request) => {
    // Ahead of Start's middleware: Mux has no session, and its signature is the check.
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/api/mux/webhook") {
      return handleMuxWebhook(request);
    }
    if (pathname.startsWith("/share/") || pathname.startsWith("/invite/"))
      return withShareHeaders(request);
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
