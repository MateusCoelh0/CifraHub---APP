import * as implementation from "./legacyRepository.js";

/** Pool compartilhado pelos repositórios e serviços PostgreSQL. */
export const pool = implementation.pool;
/** Carrega a biblioteca da primeira banda administrada pelo e-mail legado. */
export const loadBandLibrary = implementation.loadBandLibrary;
/** Carrega repertório e playlists por UUID de banda. */
export const loadBandLibraryById = implementation.loadBandLibraryById;
/** Persiste música na banda indicada. */
export const insertSong = implementation.insertSong;
/** Atualiza música somente dentro da banda proprietária. */
export const updateSong = implementation.updateSong;
/** Remove música da banda proprietária. */
export const removeSong = implementation.removeSong;
/** Cria ou substitui playlist e suas músicas em uma transação. */
export const savePlaylist = implementation.savePlaylist;
/** Remove playlist somente dentro da banda proprietária. */
export const removePlaylist = implementation.removePlaylist;
