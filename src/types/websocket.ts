import type { Setlist, SessionState, Song } from "../domain/entities.js";

/** União tipada das mensagens aceitas do navegador para o servidor. */
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
  | {
      type: "addSong";
      title?: string;
      artist?: string;
      key?: string;
      tempo?: number;
      cifra?: string;
    }
  | { type: "updateSong"; song: Song }
  | { type: "deleteSong" | "deleteSetlist"; id: string }
  | { type: "createSetlist"; name?: string; songs?: string[] }
  | { type: "updateSetlist"; setlist: Setlist }
  | { type: "transferHost"; targetClientId: string }
  | { type: "claimHost" };

/** União tipada das notificações emitidas pelo servidor aos clientes. */
export type ServerMessage =
  | {
      type: "init";
      state: SessionState;
      clientId: string;
      isHost: boolean;
      clientsCount: number;
      hostToken?: string;
      clients?: Array<{ id: string; deviceName: string; isHost: boolean; role?: string | null }>;
    }
  | {
      type: "clientsUpdate";
      clientsCount: number;
      clients?: Array<{ id: string; deviceName: string; isHost: boolean; role?: string | null }>;
    }
  | { type: "newHost"; clientId: string; hostToken?: string }
  | {
      type: "hostTransferred";
      previousHostId: string;
      newHostId: string;
      hostToken?: string;
    }
  | { type: "stateSync"; state: SessionState; clientsCount: number }
  | {
      type: "songSelected";
      song: Song | null;
      index: number | null;
      transpose?: number;
      capotraste?: number;
    }
  | {
      type: "setlistSelected";
      setlist: Setlist;
      song?: Song | null;
      index?: number | null;
      transpose?: number;
      capotraste?: number;
    }
  | { type: "transposeUpdated"; transpose: number }
  | { type: "capotrasteUpdated"; capotraste: number }
  | { type: "autoScrollUpdated"; speed: number; isActive: boolean }
  | { type: "scrollUpdated"; position: number }
  | { type: "stageModeUpdated"; enabled: boolean }
  | { type: "songAdded"; song: Song }
  | { type: "songUpdated"; song: Song }
  | { type: "songDeleted"; id: string; setlists: Setlist[] }
  | { type: "setlistCreated" | "setlistUpdated"; setlist: Setlist }
  | { type: "setlistDeleted"; id: string }
  | { type: "operationError"; message: string };
