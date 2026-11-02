export type BandRole = "ADMIN" | "MEMBER" | "VIEWER";
export type SessionRole = "HOST" | "MEMBER";

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  tempo: number;
  cifra: string;
}

export interface Setlist {
  id: string;
  name: string;
  songs: string[];
}

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

export interface BandMember {
  bandId: string;
  userId: string;
  role: BandRole;
}

export interface SessionMember {
  userId: string;
  role: SessionRole;
}

export const createInitialSessionState = (songs: Song[], setlists: Setlist[]): SessionState => ({
  currentSong: null, currentSongIndex: null, currentSetlist: null, transpose: 0,
  capotraste: 0, autoScrollSpeed: 0, isAutoScrolling: false, scrollPosition: 0,
  stageMode: false, songs, setlists,
});
