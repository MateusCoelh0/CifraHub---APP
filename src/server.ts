import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { insertSong, loadBandLibrary, pool, removePlaylist, removeSong, savePlaylist, updateSong } from "./db/repository.js";
import type { Setlist, Song } from "./domain/entities.js";
import { SessionManager, type ManagedSession } from "./services/sessionManager.js";
import type { ClientMessage, ServerMessage } from "./types/websocket.js";

const directory = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const port = Number(process.env.PORT ?? 3000);

app.get("/", (_request, response) => response.sendFile(join(directory, "..", "index.html")));

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function safeParseMessage(raw: WebSocket.RawData): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw.toString());
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed as ClientMessage;
  } catch { return null; }
}

async function main(): Promise<void> {
  if (!pool) throw new Error("DATABASE_URL não configurada; use npm run start:legacy para o servidor antigo.");
  const library = await loadBandLibrary(process.env.LEGACY_OWNER_EMAIL);
  const sessions = new SessionManager(library.bandId, library.songs, library.setlists);
  console.log(`PostgreSQL conectado: ${library.songs.length} músicas carregadas.`);

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const sessionId = url.searchParams.get("sessionId");
    const session = sessions.resolveSession(sessionId);
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = {
      id: clientId,
      isHost: false,
      deviceName: "Dispositivo",
      send: (message: unknown) => send(socket, message as ServerMessage),
    };
    sessions.connect(session, client);

    const count = session.clients.size;
    send(socket, { type: "init", state: session.state, clientId, isHost: client.isHost, clientsCount: count });
    sessions.broadcast(session, { type: "clientsUpdate", clientsCount: count } as ServerMessage);

    socket.on("message", async raw => {
      const message = safeParseMessage(raw);
      if (!message) return;
      const state = session.state;
      const isHost = client.isHost;
      try {
        switch (message.type) {
          case "requestState": send(socket, { type: "stateSync", state, clientsCount: session.clients.size }); break;
          case "setDeviceName": client.deviceName = message.name; sessions.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size }); break;
          case "selectSong": if (isHost) { state.currentSong = message.song; state.currentSongIndex = message.index; state.transpose = 0; state.scrollPosition = 0; state.isAutoScrolling = false; sessions.broadcast(session, { type: "songSelected", song: message.song, index: message.index }); } break;
          case "selectSetlist": if (isHost) { state.currentSetlist = message.setlist; state.currentSongIndex = 0; state.currentSong = state.songs.find(song => song.id === message.setlist.songs[0]) ?? null; state.transpose = 0; sessions.broadcast(session, { type: "setlistSelected", setlist: message.setlist }); } break;
          case "transpose": if (isHost) { state.transpose = message.value; sessions.broadcast(session, { type: "transposeUpdated", transpose: message.value }); } break;
          case "capotraste": if (isHost) { state.capotraste = message.value; sessions.broadcast(session, { type: "capotrasteUpdated", capotraste: message.value }); } break;
          case "autoScroll": if (isHost) { state.autoScrollSpeed = message.speed; state.isAutoScrolling = message.speed > 0; sessions.broadcast(session, { type: "autoScrollUpdated", speed: message.speed, isActive: message.speed > 0 }); } break;
          case "scroll": if (isHost) { state.scrollPosition = message.position; sessions.broadcast(session, { type: "scrollUpdated", position: message.position }); } break;
          case "stageMode": if (isHost) { state.stageMode = message.enabled; sessions.broadcast(session, { type: "stageModeUpdated", enabled: message.enabled }); } break;
          case "nextSong":
          case "previousSong": if (isHost && state.currentSetlist) {
            const delta = message.type === "nextSong" ? 1 : -1;
            const nextIndex = (state.currentSongIndex ?? 0) + delta;
            if (nextIndex >= 0 && nextIndex < state.currentSetlist.songs.length) {
              state.currentSongIndex = nextIndex;
              state.currentSong = state.songs.find(song => song.id === state.currentSetlist?.songs[nextIndex]) ?? null;
              state.transpose = 0; state.scrollPosition = 0;
              sessions.broadcast(session, { type: "songSelected", song: state.currentSong, index: nextIndex });
            }
          } break;
          case "addSong": if (isHost) {
            const song = await insertSong(library.bandId, { title: message.title || "Nova Música", artist: message.artist || "Artista", key: message.key || "C", tempo: message.tempo || 120, cifra: message.cifra || "[C]Cifra aqui..." });
            state.songs.push(song); sessions.broadcast(session, { type: "songAdded", song });
          } break;
          case "updateSong": if (isHost && await updateSong(library.bandId, message.song)) {
            Object.assign(state.songs.find(song => song.id === message.song.id) ?? {}, message.song);
            sessions.broadcast(session, { type: "songUpdated", song: message.song });
          } break;
          case "deleteSong": if (isHost && await removeSong(library.bandId, message.id)) {
            state.songs = state.songs.filter(song => song.id !== message.id);
            state.setlists = state.setlists.map(list => ({ ...list, songs: list.songs.filter(id => id !== message.id) }));
            if (state.currentSong?.id === message.id) state.currentSong = null;
            sessions.broadcast(session, { type: "songDeleted", id: message.id, setlists: state.setlists });
          } break;
          case "createSetlist": if (isHost) {
            const setlist: Setlist = await savePlaylist(library.bandId, { id: "", name: message.name || "Nova Setlist", songs: message.songs || [] });
            state.setlists.push(setlist); sessions.broadcast(session, { type: "setlistCreated", setlist });
          } break;
          case "updateSetlist": if (isHost) {
            const setlist = await savePlaylist(library.bandId, message.setlist);
            Object.assign(state.setlists.find(item => item.id === setlist.id) ?? {}, setlist);
            sessions.broadcast(session, { type: "setlistUpdated", setlist });
          } break;
          case "deleteSetlist": if (isHost) {
            await removePlaylist(library.bandId, message.id); state.setlists = state.setlists.filter(list => list.id !== message.id);
            sessions.broadcast(session, { type: "setlistDeleted", id: message.id });
          } break;
        }
      } catch (error) { console.error("Falha processando mensagem WebSocket:", error); }
    });

    socket.on("close", () => {
      const newHostId = sessions.disconnect(session, clientId);
      if (newHostId) sessions.broadcast(session, { type: "newHost", clientId: newHostId });
      sessions.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size });
    });
  });

  server.listen(port, "0.0.0.0", () => console.log(`CifraHub TypeScript rodando em http://localhost:${port}`));
}

main().catch(error => { console.error("Falha ao iniciar servidor:", error); process.exitCode = 1; });
