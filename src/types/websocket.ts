import type { Setlist, SessionState, Song } from "../domain/entities.js";

export type ClientMessage =
  | { type: "setDeviceName"; name: string }
  | { type: "requestState" }
  | { type: "selectSong"; song: Song; index: number }
  | { type: "selectSetlist"; setlist: Setlist }
  | { type: "transpose"; value: number }
  | { type: "capotraste"; value: number }
  | { type: "autoScroll"; speed: number }
  | { type: "scroll"; position: number }
  | { type: "stageMode"; enabled: boolean }
  | { type: "nextSong" | "previousSong" }
  | { type: "addSong"; title?: string; artist?: string; key?: string; tempo?: number; cifra?: string }
  | { type: "updateSong"; song: Song }
  | { type: "deleteSong" | "deleteSetlist"; id: string }
  | { type: "createSetlist"; name?: string; songs?: string[] }
  | { type: "updateSetlist"; setlist: Setlist };

export type ServerMessage =
  | { type: "init"; state: SessionState; clientId: string; isHost: boolean; clientsCount: number }
  | { type: "clientsUpdate"; clientsCount: number }
  | { type: "newHost"; clientId: string }
  | { type: "stateSync"; state: SessionState; clientsCount: number }
  | { type: "songSelected"; song: Song | null; index: number | null }
  | { type: "setlistSelected"; setlist: Setlist }
  | { type: "transposeUpdated"; transpose: number }
  | { type: "capotrasteUpdated"; capotraste: number }
  | { type: "autoScrollUpdated"; speed: number; isActive: boolean }
  | { type: "scrollUpdated"; position: number }
  | { type: "stageModeUpdated"; enabled: boolean }
  | { type: "songAdded"; song: Song }
  | { type: "songUpdated"; song: Song }
  | { type: "songDeleted"; id: string; setlists: Setlist[] }
  | { type: "setlistCreated" | "setlistUpdated"; setlist: Setlist }
  | { type: "setlistDeleted"; id: string };
