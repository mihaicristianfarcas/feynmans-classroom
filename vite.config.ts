// The web app's dev server and build: React, the app in web/, and /api proxied to the API server.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where the API listens (HOST, as in server/index.ts), as an address to reach it at. */
function apiHost(host?: string) {
  if (!host || host === "0.0.0.0") return "127.0.0.1";
  if (host === "::") return "[::1]";
  return host.includes(":") ? `[${host}]` : host;
}

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    host: process.env.HOST,
    proxy: {
      "/api": { target: `http://${apiHost(process.env.HOST)}:${process.env.PORT || 8787}`, changeOrigin: false },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ["pdfjs-dist"] },
});
