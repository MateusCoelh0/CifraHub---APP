import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  insertSong,
  loadBandLibraryById,
  pool,
  removePlaylist,
  removeSong,
  savePlaylist,
  updateSong,
} from "../db/repository.js";
import { findUserById, verifyToken } from "../auth/authService.js";
import type { Setlist, Song } from "../domain/entities.js";
import {
  SessionManager,
  type ClientRecord,
  type ManagedSession,
} from "../services/sessionManager.js";
import type { ServerMessage } from "../types/websocket.js";
import { parseClientMessage } from "../security/websocketSchemas.js";
import type { ClientMessage } from "../types/websocket.js";

const MESSAGE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 240;
const MAX_CONTROL_MESSAGES_PER_WINDOW = 120;
const MAX_INVALID_MESSAGES = 10;
const CONTROL_MESSAGE_TYPES = new Set([
  "selectSong",
  "selectSetlist",
  "transpose",
  "capotraste",
  "autoScroll",
  "scroll",
  "stageMode",
  "nextSong",
  "previousSong",
]);

interface BandLibrary {
  bandId: string;
  songs: Song[];
  setlists: Setlist[];
}
interface ConnectionContext {
  socket: WebSocket;
  session: ManagedSession;
  manager: SessionManager;
  client: ClientRecord;
  bandId: string;
  messages: number[];
  controls: number[];
  invalidMessages: number;
}

/** Gere salas de palco, permissões e transmissões WebSocket isoladas por sessão.
 * A eleição escolhe o primeiro ADMIN ou MEMBER autorizado; convidados entram como somente leitura.
 */
export class WebSocketSessionService {
  private readonly managers = new Map<string, SessionManager>();
  private readonly activeSessions = new Map<string, ManagedSession>();

  /** Cria o serviço com a biblioteca legada usada para conexões sem sessionId.
   * @param defaultLibrary Banda e repertório padrão do CifraHub.
   */
  constructor(private readonly defaultLibrary: BandLibrary) {}

  /** Registra o tratamento de novas conexões WebSocket autenticadas ou convidadas.
   * @param server Servidor WebSocket já configurado com limites e validação de origem.
   */
  attach(server: WebSocketServer): void {
    server.on("connection", (socket, request) => {
      void this.openConnection(socket, request);
    });
  }

  /** Retorna quantos dispositivos estão ligados à sessão solicitada.
   * @param sessionId Identificador da sala.
   * @returns Contagem atual ou zero se a sessão não estiver em memória.
   */
  connectedDevices(sessionId: string): number {
    return this.activeSessions.get(sessionId)?.clients.size ?? 0;
  }

  /** Transmite e sincroniza alterações de repertório para todas as sessões da banda */
  broadcastToBand(bandId: string, message: ServerMessage): void {
    const manager = this.managers.get(bandId);
    if (!manager) return;
    for (const session of this.activeSessions.values()) {
      if (session.bandId === bandId) {
        if (message.type === "songAdded") {
          if (!session.state.songs.some((s) => s.id === message.song.id)) {
            session.state.songs.push(message.song);
          }
        } else if (message.type === "songUpdated") {
          const idx = session.state.songs.findIndex((s) => s.id === message.song.id);
          if (idx !== -1) session.state.songs[idx] = message.song;
        } else if (message.type === "songDeleted") {
          session.state.songs = session.state.songs.filter((s) => s.id !== message.id);
          if (message.setlists) session.state.setlists = message.setlists;
          if (session.state.currentSong?.id === message.id) {
            session.state.currentSong = null;
            session.state.currentSongIndex = null;
          }
        } else if (message.type === "setlistCreated") {
          if (!session.state.setlists.some((sl) => sl.id === message.setlist.id)) {
            session.state.setlists.push(message.setlist);
          }
        } else if (message.type === "setlistUpdated") {
          const sidx = session.state.setlists.findIndex((s) => s.id === message.setlist.id);
          if (sidx !== -1) session.state.setlists[sidx] = message.setlist;
        } else if (message.type === "setlistDeleted") {
          session.state.setlists = session.state.setlists.filter((s) => s.id !== message.id);
        }
        manager.broadcast(session, message);
      }
    }
  }

  private async openConnection(
    socket: WebSocket,
    request: import("node:http").IncomingMessage,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (
        [...url.searchParams.keys()].some(
          (key) => key !== "sessionId" && key !== "token" && key !== "code" && key !== "hostToken",
        )
      ) {
        socket.close(1008, "Parâmetros WebSocket não permitidos");
        return;
      }
      const sessionId = url.searchParams.get("sessionId");
      const sessionCode = url.searchParams.get("code");
      const access = await this.resolveAccess(
        url.searchParams.get("token") ?? this.readBearer(request),
        sessionId,
        sessionCode,
        socket,
      );
      if (!access) return;
      const manager = await this.managerFor(access.bandId);
      const session = manager.resolveSession(access.sessionId);
      this.activeSessions.set(session.id, session);
      const client: ClientRecord = {
        id: this.createClientId(),
        isHost: false,
        deviceName: "Dispositivo",
        bandRole: access.role,
        send: (message) => this.send(socket, message as ServerMessage),
      };
      manager.connect(
        session,
        client,
        access.role === "ADMIN" || access.role === "MEMBER",
        url.searchParams.get("hostToken"),
      );
      this.send(socket, {
        type: "init",
        state: session.state,
        clientId: client.id,
        isHost: client.isHost,
        clientsCount: session.clients.size,
        ...(client.isHost && session.hostToken ? { hostToken: session.hostToken } : {}),
      });
      manager.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size });
      const context: ConnectionContext = {
        socket,
        session,
        manager,
        client,
        bandId: access.bandId,
        messages: [],
        controls: [],
        invalidMessages: 0,
      };
      socket.on("message", (raw) => {
        void this.handleRawMessage(context, raw);
      });
      socket.on("close", () => this.closeConnection(context));
    } catch (error) {
      console.error("WebSocket recusado:", error instanceof Error ? error.message : error);
      if (socket.readyState === WebSocket.OPEN)
        socket.close(1008, "Falha de autenticação ou autorização");
    }
  }

  private async resolveAccess(
    token: string | null,
    sessionId: string | null,
    sessionCode: string | null,
    socket: WebSocket,
  ): Promise<{
    bandId: string;
    role: "ADMIN" | "MEMBER" | "VIEWER" | null;
    sessionId: string | null;
  } | null> {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if ((sessionId && !uuidPattern.test(sessionId)) || (sessionId && sessionCode)) {
      socket.close(1008, "Identificador de sessão inválido");
      return null;
    }
    if (sessionCode && !/^\d{6}$/.test(sessionCode)) {
      socket.close(1008, "Código de sessão inválido");
      return null;
    }
    let userId: string | null = null;
    if (token) {
      const payload = verifyToken(token);
      const user = await findUserById(payload.sub);
      if (!user) {
        socket.close(1008, "Usuário inválido");
        return null;
      }
      userId = user.id;
    }
    let bandId = this.defaultLibrary.bandId;
    let resolvedSessionId: string | null = null;
    if (sessionId || sessionCode) {
      const row = await pool!.query(
        `SELECT id::text, band_id::text FROM sessions
         WHERE status='LIVE' AND (($1::uuid IS NOT NULL AND id=$1::uuid)
         OR ($2::char(6) IS NOT NULL AND session_code=$2))`,
        [sessionId, sessionCode],
      );
      if (!row.rowCount) {
        socket.close(1008, "Sessão não encontrada ou encerrada");
        return null;
      }
      bandId = row.rows[0].band_id;
      resolvedSessionId = row.rows[0].id;
    }
    let role: "ADMIN" | "MEMBER" | "VIEWER" | null = null;
    if (userId) {
      const membership = await pool!.query(
        "SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2",
        [bandId, userId],
      );
      if (!membership.rowCount) {
        socket.close(1008, "Você não pertence a esta banda");
        return null;
      }
      role = membership.rows[0].role;
    }
    return { bandId, role, sessionId: resolvedSessionId };
  }

  private async managerFor(bandId: string): Promise<SessionManager> {
    const cached = this.managers.get(bandId);
    if (cached) return cached;
    const library =
      bandId === this.defaultLibrary.bandId
        ? this.defaultLibrary
        : await loadBandLibraryById(bandId);
    const manager = new SessionManager(bandId, library.songs, library.setlists);
    this.managers.set(bandId, manager);
    return manager;
  }

  private async handleRawMessage(context: ConnectionContext, raw: RawData): Promise<void> {
    if (!this.acceptRate(context)) return;
    const message = parseClientMessage(raw.toString());
    if (!message) {
      context.invalidMessages++;
      console.warn(
        `WebSocket ${context.client.id}: mensagem inválida (${context.invalidMessages}).`,
      );
      if (context.invalidMessages >= MAX_INVALID_MESSAGES)
        context.socket.close(1008, "Mensagens inválidas repetidas");
      return;
    }
    if (CONTROL_MESSAGE_TYPES.has(message.type)) {
      context.controls.push(Date.now());
      context.controls = context.controls.filter((time) => Date.now() - time < MESSAGE_WINDOW_MS);
      if (context.controls.length > MAX_CONTROL_MESSAGES_PER_WINDOW) {
        context.socket.close(1008, "Limite de comandos de palco excedido");
        return;
      }
    }
    try {
      if (await this.handleSessionMessage(context, message)) return;
      await this.handleLibraryMessage(context, message);
    } catch (error) {
      console.error("Falha processando mensagem WebSocket:", error);
      this.send(context.socket, {
        type: "operationError",
        message: "Não foi possível concluir a alteração. Verifique sua conexão e tente novamente.",
      });
    }
  }

  private acceptRate(context: ConnectionContext): boolean {
    const now = Date.now();
    context.messages = context.messages.filter((time) => now - time < MESSAGE_WINDOW_MS);
    if (context.messages.length >= MAX_MESSAGES_PER_WINDOW) {
      context.socket.close(1008, "Limite de mensagens excedido");
      return false;
    }
    context.messages.push(now);
    return true;
  }

  private async handleSessionMessage(
    context: ConnectionContext,
    message: ClientMessage,
  ): Promise<boolean> {
    const { session, manager, client, socket } = context;
    const state = session.state;
    const host = client.isHost;
    switch (message.type) {
      case "requestState":
        this.send(socket, { type: "stateSync", state, clientsCount: session.clients.size });
        return true;
      case "setDeviceName":
        client.deviceName = message.name;
        manager.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size });
        return true;
      case "selectSong":
        if (host) this.selectSong(session, message.song, message.index);
        return true;
      case "selectSetlist":
        if (host) this.selectSetlist(session, message.setlist);
        return true;
      case "transpose":
        if (host) {
          state.transpose = message.value;
          manager.broadcast(session, { type: "transposeUpdated", transpose: message.value });
        }
        return true;
      case "capotraste":
        if (host) {
          state.capotraste = message.value;
          manager.broadcast(session, { type: "capotrasteUpdated", capotraste: message.value });
        }
        return true;
      case "autoScroll":
        if (host) {
          state.autoScrollSpeed = message.speed;
          state.isAutoScrolling = message.speed > 0;
          manager.broadcast(session, {
            type: "autoScrollUpdated",
            speed: message.speed,
            isActive: message.speed > 0,
          });
        }
        return true;
      case "scroll":
        if (host) {
          state.scrollPosition = message.position;
          manager.broadcast(session, { type: "scrollUpdated", position: message.position });
        }
        return true;
      case "stageMode":
        if (host) {
          state.stageMode = message.enabled;
          manager.broadcast(session, { type: "stageModeUpdated", enabled: message.enabled });
        }
        return true;
      case "nextSong":
      case "previousSong":
        if (host) this.navigateSong(session, message.type);
        return true;
      default:
        return false;
    }
  }

  private selectSong(session: ManagedSession, song: Song, index: number): void {
    session.state.currentSong = song;
    session.state.currentSongIndex = index;
    session.state.transpose = 0;
    session.state.capotraste = 0;
    session.state.scrollPosition = 0;
    session.state.isAutoScrolling = false;
    this.broadcast(session, { type: "songSelected", song, index, transpose: 0, capotraste: 0 });
  }

  private selectSetlist(session: ManagedSession, setlist: Setlist): void {
    session.state.currentSetlist = setlist;
    session.state.currentSongIndex = 0;
    session.state.currentSong =
      session.state.songs.find((song) => song.id === setlist.songs[0]) ?? null;
    session.state.transpose = 0;
    session.state.capotraste = 0;
    session.state.scrollPosition = 0;
    session.state.isAutoScrolling = false;
    this.broadcast(session, {
      type: "setlistSelected",
      setlist,
      song: session.state.currentSong,
      index: session.state.currentSongIndex,
      transpose: 0,
      capotraste: 0,
    });
  }

  private navigateSong(session: ManagedSession, direction: "nextSong" | "previousSong"): void {
    const { state } = session;
    if (!state.currentSetlist) return;
    const index = (state.currentSongIndex ?? 0) + (direction === "nextSong" ? 1 : -1);
    if (index < 0 || index >= state.currentSetlist.songs.length) return;
    state.currentSongIndex = index;
    state.currentSong =
      state.songs.find((song) => song.id === state.currentSetlist?.songs[index]) ?? null;
    state.transpose = 0;
    state.capotraste = 0;
    state.scrollPosition = 0;
    this.broadcast(session, {
      type: "songSelected",
      song: state.currentSong,
      index,
      transpose: 0,
      capotraste: 0,
    });
  }

  private async handleLibraryMessage(
    context: ConnectionContext,
    message: ClientMessage,
  ): Promise<void> {
    const { session, manager, client, bandId } = context;
    const { state } = session;
    if (client.bandRole !== "ADMIN" && client.bandRole !== "MEMBER") return;
    switch (message.type) {
      case "addSong": {
        const song = await insertSong(bandId, {
          title: message.title || "Nova Música",
          artist: message.artist || "Artista",
          key: message.key || "C",
          tempo: message.tempo || 120,
          cifra: message.cifra || "[C]Cifra aqui...",
        });
        state.songs.push(song);
        manager.broadcast(session, { type: "songAdded", song });
        break;
      }
      case "updateSong":
        if (await updateSong(bandId, message.song)) {
          Object.assign(
            state.songs.find((song) => song.id === message.song.id) ?? {},
            message.song,
          );
          manager.broadcast(session, { type: "songUpdated", song: message.song });
        }
        break;
      case "deleteSong":
        if (await removeSong(bandId, message.id)) {
          state.songs = state.songs.filter((song) => song.id !== message.id);
          state.setlists = state.setlists.map((list) => ({
            ...list,
            songs: list.songs.filter((id) => id !== message.id),
          }));
          if (state.currentSong?.id === message.id) state.currentSong = null;
          manager.broadcast(session, {
            type: "songDeleted",
            id: message.id,
            setlists: state.setlists,
          });
        }
        break;
      case "createSetlist": {
        const setlist = await savePlaylist(bandId, {
          id: "",
          name: message.name || "Nova Setlist",
          songs: message.songs || [],
        });
        state.setlists.push(setlist);
        manager.broadcast(session, { type: "setlistCreated", setlist });
        break;
      }
      case "updateSetlist": {
        const setlist = await savePlaylist(bandId, message.setlist);
        Object.assign(state.setlists.find((item) => item.id === setlist.id) ?? {}, setlist);
        manager.broadcast(session, { type: "setlistUpdated", setlist });
        break;
      }
      case "deleteSetlist":
        await removePlaylist(bandId, message.id);
        state.setlists = state.setlists.filter((list) => list.id !== message.id);
        manager.broadcast(session, { type: "setlistDeleted", id: message.id });
        break;
    }
  }

  private closeConnection(context: ConnectionContext): void {
    const { session, manager, client } = context;
    const nextHost = manager.disconnect(session, client.id);
    if (nextHost) manager.broadcast(session, { type: "newHost", clientId: nextHost });
    manager.broadcast(session, { type: "clientsUpdate", clientsCount: session.clients.size });
  }

  private broadcast(session: ManagedSession, message: ServerMessage): void {
    this.managers.get(session.bandId)?.broadcast(session, message);
  }
  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
  private readBearer(request: import("node:http").IncomingMessage): string | null {
    const value = request.headers.authorization;
    return value?.startsWith("Bearer ") ? value.slice(7) : null;
  }
  private createClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
