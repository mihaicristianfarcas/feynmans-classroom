import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT || 8787}`, changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ["pdfjs-dist"] },
});
