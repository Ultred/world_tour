import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import type { GameEvent } from "../shared/types.js";
import { config } from "./config.js";
import { startTikTok, type TikTokConnectionHandle } from "./tiktok.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file runs from dist/server (tsc's outDir mirrors the "server" include root),
// sitting alongside the client build at dist/client.
const CLIENT_DIST = path.join(__dirname, "../client");

const app = express();
app.use(express.json());
app.use(express.static(CLIENT_DIST));

const httpServer = createServer(app);
// A distinct path (not "/") so this doesn't collide with Vite's own HMR websocket in dev,
// where the client and server run on different ports behind a proxy (see vite.config.ts).
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

function broadcast(event: GameEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

let lastStatus: GameEvent | null = null;
// The control tab's most recent board choice — replayed to a freshly-connected socket so the
// ?obs=1 broadcast view (or any other tab) opened mid-round catches up to the right
// level/countdown immediately instead of sitting blank until the next board.
let lastBoard: GameEvent | null = null;

wss.on("connection", (socket) => {
  console.log(`Overlay client connected (${wss.clients.size} total).`);
  // Bring a freshly-opened overlay (e.g. a reloaded OBS browser source) up to
  // date on connection status immediately, rather than leaving it blank until
  // the next TikTok event happens to fire.
  if (lastStatus) socket.send(JSON.stringify(lastStatus));
  if (lastBoard) socket.send(JSON.stringify(lastBoard));
  socket.on("close", () => console.log(`Overlay client disconnected (${wss.clients.size} total).`));
});

function emit(event: GameEvent): void {
  if (event.type === "status") lastStatus = event;
  if (event.type === "board") lastBoard = event;
  broadcast(event);
}

// Which TikTok LIVE is being watched — set at boot from TIKTOK_USERNAME (if configured), and
// replaceable at runtime from the dev panel's Connect/Disconnect buttons (POST /api/connect|disconnect).
let activeConnection: TikTokConnectionHandle | null = null;

function connectTo(username: string): void {
  activeConnection?.disconnect();
  activeConnection = startTikTok(username, emit, config.EULER_API_KEY);
}

function disconnect(): void {
  activeConnection?.disconnect();
  activeConnection = null;
  emit({ type: "status", state: "offline" });
}

app.post("/api/connect", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  connectTo(username);
  res.json({ ok: true, username });
});

app.post("/api/disconnect", (_req, res) => {
  disconnect();
  res.json({ ok: true });
});

// Local-only relay for events that originate in a browser tab rather than from TikTok itself:
// the moderator's simulated guesses/power-ups, and the control tab's board choices (see
// client/src/net.ts, game/progression.ts, dev/testPanel.ts). Broadcasting through here — the
// exact same `emit` a real TikTok event uses — is what keeps every connected screen (the ?obs=1
// broadcast view included) in lockstep, instead of each browser tab running an independent game.
app.post("/api/emit", (req, res) => {
  const event = req.body as GameEvent | undefined;
  if (!event || typeof event.type !== "string") {
    res.status(400).json({ error: "a GameEvent body is required" });
    return;
  }
  emit(event);
  res.json({ ok: true });
});

// SPA fallback: the overlay is a single page (Vite build), so any other (non-API) path still serves it.
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

if (config.TIKTOK_USERNAME) connectTo(config.TIKTOK_USERNAME);

httpServer.listen(config.PORT, () => {
  console.log(`Word Tour server listening on http://localhost:${config.PORT}`);
  console.log(config.TIKTOK_USERNAME ? `Watching TikTok LIVE: @${config.TIKTOK_USERNAME}` : "No TIKTOK_USERNAME set — connect from the dev panel.");
});
