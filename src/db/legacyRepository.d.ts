import type { Setlist, Song } from "../domain/entities.js";
import type pg from "pg";

export const pool: pg.Pool | null;
export function loadBandLibrary(
  email: string | undefined,
): Promise<{ bandId: string; songs: Song[]; setlists: Setlist[] }>;
export function loadBandLibraryById(
  bandId: string,
): Promise<{ bandId: string; songs: Song[]; setlists: Setlist[] }>;
export function insertSong(bandId: string, song: Omit<Song, "id"> & { id?: string }): Promise<Song>;
export function updateSong(bandId: string, song: Song): Promise<boolean>;
export function removeSong(bandId: string, id: string): Promise<boolean>;
export function savePlaylist(bandId: string, playlist: Setlist): Promise<Setlist>;
export function removePlaylist(bandId: string, id: string): Promise<void>;
