/** Papéis disponíveis para integrantes de uma banda. */
export type BandRole = "ADMIN" | "MEMBER" | "VIEWER";
/** Permissões associadas à participação em uma sessão de palco. */
export type SessionRole = "HOST" | "MEMBER";

/** Música persistida e apresentada pelo contrato legado da interface. */
export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  tempo: number;
  cifra: string;
}

/** Lista de repertório com músicas ordenadas por identificador. */
export interface Setlist {
  id: string;
  name: string;
  songs: string[];
}

/** Estado de palco independente mantido por cada sessão ativa. */
export interface SessionState {
  currentSong: Song | null;
  currentSongIndex: number | null;
  currentSetlist: Setlist | null;
  transpose: number;
  capotraste: number;
  autoScrollSpeed: number;
  isAutoScrolling: boolean;
  scrollPosition: number;
  stageMode: boolean;
  songs: Song[];
  setlists: Setlist[];
}

/** Relação de usuário e papel dentro de uma banda. */
export interface BandMember {
  bandId: string;
  userId: string;
  role: BandRole;
}

/** Relação de usuário e papel dentro de uma sessão. */
export interface SessionMember {
  userId: string;
  role: SessionRole;
}

/** Cria estado inicial sem compartilhar valores mutáveis de controle. */
export const createInitialSessionState = (songs: Song[], setlists: Setlist[]): SessionState => ({
  currentSong: null,
  currentSongIndex: null,
  currentSetlist: null,
  transpose: 0,
  capotraste: 0,
  autoScrollSpeed: 0,
  isAutoScrolling: false,
  scrollPosition: 0,
  stageMode: false,
  songs,
  setlists,
});
