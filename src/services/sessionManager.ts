import { createInitialSessionState, type SessionState } from "../domain/entities.js";

/** Informações de uma conexão vinculada a uma sala de palco. */
export interface ClientRecord {
  id: string;
  isHost: boolean;
  deviceName: string;
  bandRole?: "ADMIN" | "MEMBER" | "VIEWER" | null;
  send: (message: unknown) => void;
}

/** Dados efêmeros de uma sessão, incluindo clientes, HOST e controles atuais. */
export interface ManagedSession {
  id: string;
  bandId: string;
  state: SessionState;
  clients: Map<string, ClientRecord>;
  hostId: string | null;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(
    private readonly bandId: string,
    private readonly songs: SessionState["songs"],
    private readonly setlists: SessionState["setlists"],
  ) {}

  /** Obtém ou cria a sala em memória dentro da banda indicada pelo gerenciador.
   * @param requestedId Identificador da sessão ou null para a sala legada padrão.
   * @returns Sessão isolada com estado e conexões próprios.
   */
  resolveSession(requestedId?: string | null): ManagedSession {
    const id = requestedId?.trim() || "default";
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        id,
        bandId: this.bandId,
        state: createInitialSessionState(this.songs, this.setlists),
        clients: new Map(),
        hostId: null,
      };
      this.sessions.set(id, session);
    }
    return session;
  }

  /** Registra dispositivo e elege o primeiro integrante autorizado como HOST.
   * @param session Sala onde o dispositivo entrou.
   * @param client Conexão WebSocket associada ao usuário ou convidado.
   * @param canControl Indica se o papel do integrante permite controlar o palco.
   */
  connect(session: ManagedSession, client: ClientRecord, canControl = false): void {
    session.clients.set(client.id, client);
    if (!session.hostId && canControl) {
      session.hostId = client.id;
      client.isHost = true;
    }
  }

  /** Remove dispositivo e elege outro integrante autorizado se o HOST sair.
   * @param session Sala da qual o dispositivo saiu.
   * @param clientId Identificador do cliente desconectado.
   * @returns Identificador do novo HOST ou null quando não há outro autorizado.
   */
  disconnect(session: ManagedSession, clientId: string): string | null {
    session.clients.delete(clientId);
    if (session.hostId !== clientId) return null;
    const next = [...session.clients.values()].find(
      (client) => client.bandRole === "ADMIN" || client.bandRole === "MEMBER",
    );
    session.hostId = next?.id ?? null;
    if (next) next.isHost = true;
    return session.hostId;
  }

  /** Envia uma mensagem apenas aos dispositivos conectados à mesma sala.
   * @param session Sala que recebe a transmissão.
   * @param message Conteúdo serializável enviado às conexões.
   */
  broadcast(session: ManagedSession, message: unknown): void {
    for (const client of session.clients.values()) client.send(message);
  }
}
