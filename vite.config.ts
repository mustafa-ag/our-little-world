import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
