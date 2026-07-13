import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Nitro's deployment preset (node-server for Railway, vs. Cloudflare Workers
// on Lovable) is picked at build time via the NITRO_PRESET env var — see
// Dockerfile — not through this config.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts
      // (our SSR error wrapper). nitro/vite builds from this.
      server: { entry: "server" },
    }),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
  },
});
