import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const ownerEmail = process.env.LEGACY_OWNER_EMAIL;
const bandName = process.env.LEGACY_BAND_NAME ?? "Minha Banda";
const dataFile = resolve(process.env.DATA_FILE ?? "data.json");

if (!databaseUrl || !ownerEmail) {
  console.error("Configure DATABASE_URL e LEGACY_OWNER_EMAIL no arquivo .env antes da importação.");
  process.exit(1);
}

const raw = await readFile(dataFile, "utf8");
const legacy = JSON.parse(raw);
if (!Array.isArray(legacy.songs) || !Array.isArray(legacy.setlists)) {
  throw new Error("data.json precisa conter arrays 'songs' e 'setlists'.");
}

const checksum = createHash("sha256").update(raw).digest("hex");
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS legacy_imports (
      source text PRIMARY KEY,
      checksum text NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      songs_count integer NOT NULL,
      playlists_count integer NOT NULL
    )
  `);
  const prior = await client.query("SELECT checksum FROM legacy_imports WHERE source = $1", [
    dataFile,
  ]);
  if (prior.rowCount) {
    if (prior.rows[0].checksum === checksum) {
      await client.query("COMMIT");
      console.log("Este data.json já foi importado; nenhuma alteração foi feita.");
      process.exitCode = 0;
    } else {
      throw new Error(
        "Este data.json já foi importado com outro conteúdo. Não sobrescrevi dados; revise antes de uma nova importação.",
      );
    }
  } else {
    const user = await client.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [ownerEmail.toLowerCase(), ownerEmail.split("@")[0], "legacy-import-no-password-login"],
    );
    const band = await client.query(
      `INSERT INTO bands (name, created_by) VALUES ($1, $2) RETURNING id`,
      [bandName, user.rows[0].id],
    );
    const bandId = band.rows[0].id;
    await client.query(
      `INSERT INTO band_members (band_id, user_id, role) VALUES ($1, $2, 'ADMIN')`,
      [bandId, user.rows[0].id],
    );

    const songIds = new Map();
    for (const song of legacy.songs) {
      const inserted = await client.query(
        `INSERT INTO songs (band_id, title, artist, musical_key, tempo, lyrics)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          bandId,
          song.title || "Sem título",
          song.artist || null,
          song.key || null,
          Number.isFinite(Number(song.tempo)) ? Number(song.tempo) : null,
          song.cifra || "",
        ],
      );
      songIds.set(String(song.id), inserted.rows[0].id);
    }

    for (const list of legacy.setlists) {
      const inserted = await client.query(
        `INSERT INTO playlists (band_id, name) VALUES ($1, $2) RETURNING id`,
        [bandId, list.name || "Setlist"],
      );
      const playlistId = inserted.rows[0].id;
      let position = 0;
      for (const legacySongId of list.songs ?? []) {
        const songId = songIds.get(String(legacySongId));
        if (!songId) continue;
        await client.query(
          `INSERT INTO playlist_songs (band_id, playlist_id, song_id, position) VALUES ($1, $2, $3, $4)`,
          [bandId, playlistId, songId, position++],
        );
      }
    }

    await client.query(
      `INSERT INTO legacy_imports (source, checksum, songs_count, playlists_count) VALUES ($1, $2, $3, $4)`,
      [dataFile, checksum, legacy.songs.length, legacy.setlists.length],
    );
    await client.query("COMMIT");
    console.log(
      `Importação concluída: ${legacy.songs.length} músicas e ${legacy.setlists.length} setlists na banda '${bandName}'.`,
    );
    console.log("data.json foi mantido intacto.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Importação cancelada; a transação foi revertida:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
