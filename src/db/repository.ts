import * as implementation from "./legacyRepository.js";

export const pool = implementation.pool;
export const loadBandLibrary = implementation.loadBandLibrary;
export const loadBandLibraryById = implementation.loadBandLibraryById;
export const insertSong = implementation.insertSong;
export const updateSong = implementation.updateSong;
export const removeSong = implementation.removeSong;
export const savePlaylist = implementation.savePlaylist;
export const removePlaylist = implementation.removePlaylist;
