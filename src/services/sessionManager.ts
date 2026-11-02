import { createInitialSessionState, type SessionState } from "../domain/entities.js";

export interface ClientRecord {
  id: string;
  isHost: boolean;
  deviceName: string;
  bandRole?: "ADMIN" | "MEMBER" | "VIEWER" | null;
  send: (message: unknown) => void;
}

export interface ManagedSession {
  id: string;
  bandId: string;
  state: SessionState;
  clients: Map<string, ClientRecord>;
  hostId: string | null;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly bandId: string, private readonly songs: SessionState["songs"], private readonly setlists: SessionState["setlists"]) {}

  resolveSession(requestedId?: string | null): ManagedSession {
    const id = requestedId?.trim() || "default";
    let session = this.sessions.get(id);
    if (!session) {
      session = { id, bandId: this.bandId, state: createInitialSessionState(this.songs, this.setlists), clients: new Map(), hostId: null };
      this.sessions.set(id, session);
    }
    return session;
  }

  connect(session: ManagedSession, client: ClientRecord, canControl = false): void {
    session.clients.set(client.id, client);
    if (!session.hostId && canControl) { session.hostId = client.id; client.isHost = true; }
  }

  disconnect(session: ManagedSession, clientId: string): string | null {
    session.clients.delete(clientId);
    if (session.hostId !== clientId) return null;
    const next = [...session.clients.values()].find(client => client.bandRole === "ADMIN" || client.bandRole === "MEMBER");
    session.hostId = next?.id ?? null;
    if (next) next.isHost = true;
    return session.hostId;
  }

  broadcast(session: ManagedSession, message: unknown): void {
    for (const client of session.clients.values()) client.send(message);
  }
}
