import handler from "@tanstack/react-start/server-entry";
import { handleMuxWebhook } from "@/server/revision-lifecycle";
import { runHourly } from "@/server/purge";

export default {
  scheduled: (controller) => runHourly(controller.scheduledTime),
  fetch: (request) => {
    // Ahead of Start's middleware: Mux has no session, and its signature is the check.
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/api/mux/webhook") {
      return handleMuxWebhook(request);
    }
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
