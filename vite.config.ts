import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
        manualChunks(id) {
          // keep Vite's shared runtime helpers (e.g. dynamic-import preload) out of the
          // vendor chunks so the legacy 2D entry never pulls in Babylon and vice versa
          if (id.startsWith("\0vite/") || id.includes("vite/preload-helper")) return "vite-runtime";
          if (id.includes("node_modules/@babylonjs/")) return "babylon";
          if (id.includes("node_modules/phaser/")) return "phaser";
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon.png",
        "icons/apple-touch-icon.png",
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
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
