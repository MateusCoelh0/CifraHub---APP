import pg from "pg";

const { Pool } = pg;
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    })
  : null;

export async function loadBandLibrary(email) {
  if (!pool || !email) throw new Error("DATABASE_URL e LEGACY_OWNER_EMAIL são necessários.");
  const band = await pool.query(
    `SELECT b.id FROM bands b
     JOIN band_members bm ON bm.band_id = b.id
     JOIN users u ON u.id = bm.user_id
     WHERE lower(u.email) = lower($1) AND bm.role = 'ADMIN'
     ORDER BY b.created_at LIMIT 1`, [email]
  );
  if (!band.rowCount) throw new Error("Banda inicial não encontrada. Execute npm run db:import-legacy.");
  const bandId = band.rows[0].id;
  const songs = await pool.query(
    `SELECT id::text, title, artist, musical_key AS key, tempo, lyrics AS cifra
     FROM songs WHERE band_id = $1 ORDER BY created_at, id`, [bandId]
  );
  const playlists = await pool.query(
    `SELECT p.id::text, p.name, COALESCE(array_agg(ps.song_id::text ORDER BY ps.position)
       FILTER (WHERE ps.song_id IS NOT NULL), '{}') AS songs
     FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
     WHERE p.band_id = $1 GROUP BY p.id ORDER BY p.created_at, p.id`, [bandId]
  );
  return { bandId, songs: songs.rows, setlists: playlists.rows };
}

export async function insertSong(bandId, song) {
  const { rows } = await pool.query(
    `INSERT INTO songs (band_id,title,artist,musical_key,tempo,lyrics)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
    [bandId, song.title, song.artist, song.key, song.tempo, song.cifra]
  );
  return { ...song, id: rows[0].id };
}

export async function updateSong(bandId, song) {
  const { rowCount } = await pool.query(
    `UPDATE songs SET title=$3,artist=$4,musical_key=$5,tempo=$6,lyrics=$7,updated_at=now()
     WHERE band_id=$1 AND id=$2`,
    [bandId, song.id, song.title, song.artist, song.key, song.tempo, song.cifra]
  );
  return rowCount > 0;
}

export async function removeSong(bandId, id) {
  const { rowCount } = await pool.query("DELETE FROM songs WHERE band_id=$1 AND id=$2", [bandId, id]);
  return rowCount > 0;
}

export async function savePlaylist(bandId, playlist) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let playlistId = playlist.id;
    if (playlistId) {
      const result = await client.query(
        "UPDATE playlists SET name=$3,updated_at=now() WHERE band_id=$1 AND id=$2 RETURNING id::text",
        [bandId, playlistId, playlist.name]
      );
      if (!result.rowCount) throw new Error("Setlist não encontrada.");
    } else {
      const result = await client.query(
        "INSERT INTO playlists (band_id,name) VALUES ($1,$2) RETURNING id::text",
        [bandId, playlist.name]
      );
      playlistId = result.rows[0].id;
    }
    await client.query("DELETE FROM playlist_songs WHERE band_id=$1 AND playlist_id=$2", [bandId, playlistId]);
    for (const [position, songId] of (playlist.songs ?? []).entries()) {
      await client.query(
        "INSERT INTO playlist_songs (band_id,playlist_id,song_id,position) VALUES ($1,$2,$3,$4)",
        [bandId, playlistId, songId, position]
      );
    }
    await client.query("COMMIT");
    return { ...playlist, id: playlistId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function removePlaylist(bandId, id) {
  await pool.query("DELETE FROM playlists WHERE band_id=$1 AND id=$2", [bandId, id]);
}
