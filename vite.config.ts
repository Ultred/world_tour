import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: "client",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    // In dev the client (this Vite server) and the game server (`npm run dev:server`) run on
    // different ports — forward the game's own paths to it without touching Vite's HMR socket.
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
      "/api": "http://localhost:3000",
    },
  },
});
