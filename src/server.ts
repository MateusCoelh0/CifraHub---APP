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
import { authRoutes } from "./routes/authRoutes.js";
import { createBandRoutes } from "./routes/bandRoutes.js";
import { assertAuthConfiguration, findUserById, verifyToken } from "./auth/authService.js";
import { loadBandLibraryById } from "./db/repository.js";

const directory = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const port = Number(process.env.PORT ?? 3000);

app.get("/", (_request, response) => response.sendFile(join(directory, "..", "index.html")));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authRoutes);

const managers = new Map<string, SessionManager>();
const managedSessions = new Map<string, ManagedSession>();
app.use("/api/bands", createBandRoutes(sessionId => managedSessions.get(sessionId)?.clients.size ?? 0));

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
  assertAuthConfiguration();
  const library = await loadBandLibrary(process.env.LEGACY_OWNER_EMAIL);
  console.log(`PostgreSQL conectado: ${library.songs.length} músicas carregadas.`);

  wss.on("connection", async (socket, request) => {
    try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const sessionId = url.searchParams.get("sessionId");
    const queryToken = url.searchParams.get("token");
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null;
    const token = queryToken || bearer;
    let userId: string | null = null;
    if (token) {
      const payload = verifyToken(token);
      const user = await findUserById(payload.sub);
      if (!user) { socket.close(1008, "Usuário inválido"); return; }
      userId = user.id;
    }

    let bandId = library.bandId;
    if (sessionId && pool) {
      const sessionRow = await pool.query("SELECT band_id::text FROM sessions WHERE id=$1 AND status='LIVE'", [sessionId]);
      if (!sessionRow.rowCount) { socket.close(1008, "Sessão não encontrada ou encerrada"); return; }
      bandId = sessionRow.rows[0].band_id;
    }
    let bandRole: "ADMIN" | "MEMBER" | "VIEWER" | null = null;
    if (userId && pool) {
      const membership = await pool.query("SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2", [bandId,userId]);
      if (!membership.rowCount) { socket.close(1008, "Você não pertence a esta banda"); return; }
      bandRole = membership.rows[0].role;
    }
    let manager = managers.get(bandId);
    if (!manager) {
      const bandLibrary = bandId === library.bandId ? library : await loadBandLibraryById(bandId);
      manager = new SessionManager(bandId,bandLibrary.songs,bandLibrary.setlists);
      managers.set(bandId,manager);
    }
    const session = manager.resolveSession(sessionId);
    managedSessions.set(session.id,session);
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = {
      id: clientId,
      isHost: false,
      deviceName: "Dispositivo",
      bandRole,
      send: (message: unknown) => send(socket, message as ServerMessage),
    };
    manager.connect(session, client, bandRole === "ADMIN" || bandRole === "MEMBER");

    const count = session.clients.size;
    send(socket, { type: "init", state: session.state, clientId, isHost: client.isHost, clientsCount: count });
    manager.broadcast(session, { type: "clientsUpdate", clientsCount: count } as ServerMessage);

    socket.on("message", async raw => {
      const message = safeParseMessage(raw);
      if (!message) return;
      const state = session.state;
      const isHost = client.isHost;
      const canEdit = client.bandRole === "ADMIN" || client.bandRole === "MEMBER";
      try {
        switch (message.type) {
          case "requestState": send(socket, { type: "stateSync", state, clientsCount: session.clients.size }); break;
          case "setDeviceName": client.deviceName = message.name; manager?.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size }); break;
          case "selectSong": if (isHost) { state.currentSong = message.song; state.currentSongIndex = message.index; state.transpose = 0; state.scrollPosition = 0; state.isAutoScrolling = false; manager?.broadcast(session, { type: "songSelected", song: message.song, index: message.index }); } break;
          case "selectSetlist": if (isHost) { state.currentSetlist = message.setlist; state.currentSongIndex = 0; state.currentSong = state.songs.find(song => song.id === message.setlist.songs[0]) ?? null; state.transpose = 0; manager?.broadcast(session, { type: "setlistSelected", setlist: message.setlist }); } break;
          case "transpose": if (isHost) { state.transpose = message.value; manager?.broadcast(session, { type: "transposeUpdated", transpose: message.value }); } break;
          case "capotraste": if (isHost) { state.capotraste = message.value; manager?.broadcast(session, { type: "capotrasteUpdated", capotraste: message.value }); } break;
          case "autoScroll": if (isHost) { state.autoScrollSpeed = message.speed; state.isAutoScrolling = message.speed > 0; manager?.broadcast(session, { type: "autoScrollUpdated", speed: message.speed, isActive: message.speed > 0 }); } break;
          case "scroll": if (isHost) { state.scrollPosition = message.position; manager?.broadcast(session, { type: "scrollUpdated", position: message.position }); } break;
          case "stageMode": if (isHost) { state.stageMode = message.enabled; manager?.broadcast(session, { type: "stageModeUpdated", enabled: message.enabled }); } break;
          case "nextSong":
          case "previousSong": if (isHost && state.currentSetlist) {
            const delta = message.type === "nextSong" ? 1 : -1;
            const nextIndex = (state.currentSongIndex ?? 0) + delta;
            if (nextIndex >= 0 && nextIndex < state.currentSetlist.songs.length) {
              state.currentSongIndex = nextIndex;
              state.currentSong = state.songs.find(song => song.id === state.currentSetlist?.songs[nextIndex]) ?? null;
              state.transpose = 0; state.scrollPosition = 0;
              manager?.broadcast(session, { type: "songSelected", song: state.currentSong, index: nextIndex });
            }
          } break;
          case "addSong": if (canEdit) {
            const song = await insertSong(bandId, { title: message.title || "Nova Música", artist: message.artist || "Artista", key: message.key || "C", tempo: message.tempo || 120, cifra: message.cifra || "[C]Cifra aqui..." });
            state.songs.push(song); manager?.broadcast(session, { type: "songAdded", song });
          } break;
          case "updateSong": if (canEdit && await updateSong(bandId, message.song)) {
            Object.assign(state.songs.find(song => song.id === message.song.id) ?? {}, message.song);
            manager?.broadcast(session, { type: "songUpdated", song: message.song });
          } break;
          case "deleteSong": if (canEdit && await removeSong(bandId, message.id)) {
            state.songs = state.songs.filter(song => song.id !== message.id);
            state.setlists = state.setlists.map(list => ({ ...list, songs: list.songs.filter(id => id !== message.id) }));
            if (state.currentSong?.id === message.id) state.currentSong = null;
            manager?.broadcast(session, { type: "songDeleted", id: message.id, setlists: state.setlists });
          } break;
          case "createSetlist": if (canEdit) {
            const setlist: Setlist = await savePlaylist(bandId, { id: "", name: message.name || "Nova Setlist", songs: message.songs || [] });
            state.setlists.push(setlist); manager?.broadcast(session, { type: "setlistCreated", setlist });
          } break;
          case "updateSetlist": if (canEdit) {
            const setlist = await savePlaylist(bandId, message.setlist);
            Object.assign(state.setlists.find(item => item.id === setlist.id) ?? {}, setlist);
            manager?.broadcast(session, { type: "setlistUpdated", setlist });
          } break;
          case "deleteSetlist": if (canEdit) {
            await removePlaylist(bandId, message.id); state.setlists = state.setlists.filter(list => list.id !== message.id);
            manager?.broadcast(session, { type: "setlistDeleted", id: message.id });
          } break;
        }
      } catch (error) { console.error("Falha processando mensagem WebSocket:", error); }
    });

    socket.on("close", () => {
      const newHostId = manager?.disconnect(session, clientId);
      if (newHostId) manager?.broadcast(session, { type: "newHost", clientId: newHostId });
      manager?.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size });
    });
    } catch (error) {
      console.error("WebSocket recusado:", error instanceof Error ? error.message : error);
      if (socket.readyState === WebSocket.OPEN) socket.close(1008,"Falha de autenticação/autorização");
    }
  });

  server.listen(port, "0.0.0.0", () => console.log(`CifraHub TypeScript rodando em http://localhost:${port}`));
}

main().catch(error => { console.error("Falha ao iniciar servidor:", error); process.exitCode = 1; });
