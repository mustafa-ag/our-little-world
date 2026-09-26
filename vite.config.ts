import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { GetModuleInfo } from "rollup";

// Is `id` statically reachable from an entry (i.e. not only via dynamic import)?
// Lazily imported Babylon modules (glTF loader, instrumentation...) must stay in
// their own async chunks instead of being forced into the eager "babylon" chunk.
const staticCache = new Map<string, boolean>();
function isStatic(id: string, getModuleInfo: GetModuleInfo, seen = new Set<string>()): boolean {
  const hit = staticCache.get(id);
  if (hit !== undefined) return hit;
  if (seen.has(id)) return false;
  seen.add(id);
  const info = getModuleInfo(id);
  if (!info) return false;
  const r = info.isEntry || info.importers.some((p) => isStatic(p, getModuleInfo, seen));
  staticCache.set(id, r);
  return r;
}

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        legacy: fileURLToPath(new URL("./legacy.html", import.meta.url)),
      },
      output: {
        manualChunks(id, { getModuleInfo }) {
          // keep Vite's shared runtime helpers (e.g. dynamic-import preload) out of the
          // vendor chunks so the legacy 2D entry never pulls in Babylon and vice versa
          if (id.startsWith("\0vite/") || id.includes("vite/preload-helper")) return "vite-runtime";
          if (id.includes("node_modules/phaser/")) return "phaser";
          if (id.includes("node_modules/@babylonjs/")) return isStatic(id, getModuleInfo) ? "babylon" : undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "our-world-heart.webmanifest",
      includeAssets: [
        "icons/favicon.png",
        "icons/apple-touch-icon.png",
        "icons/apple-touch-heart.png",
      ],
      manifest: {
        name: "Our Little World",
        short_name: "Our World",
        description: "A cute little world for us to build a life in.",
        theme_color: "#f4a6c0",
        background_color: "#8ecae6",
        display: "fullscreen",
        orientation: "any",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icons/icon-heart-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-heart-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-heart-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // Diagnostic-only chunks stay network-on-demand. Normal PWA installs
        // should not pay for Babylon instrumentation they cannot open unless
        // the explicit production ?perf=1 flag is present.
        globIgnores: ["assets/profiler-*.js", "assets/sceneInstrumentation-*.js"],
        // Babylon chunk is larger than the old 6MB Phaser-only limit.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
