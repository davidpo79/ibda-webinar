// Node entrypoint for Railway. TanStack Start's build produces a Web-standard
// `fetch(request, env, ctx)` handler (dist/server/server.js) — the same shape
// Cloudflare Workers expects natively. Node needs an actual HTTP listener and
// static-file serving for dist/client, which srvx provides.
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "..", "dist", "client");

const { default: handler } = await import("../dist/server/server.js");

serve({
  fetch: (request) => handler.fetch(request, {}, {}),
  middleware: [serveStatic({ dir: clientDir })],
  port: process.env.PORT || 3000,
  hostname: "0.0.0.0",
});
