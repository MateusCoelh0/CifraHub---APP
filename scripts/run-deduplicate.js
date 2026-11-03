import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL não configurada no ambiente. Migration SQL disponível em scripts/deduplicate-songs.sql");
  process.exit(0);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

async function runDeduplication() {
  const client = await pool.connect();
  try {
    console.log("Conectado ao banco de dados. Verificando músicas duplicadas...");

    // 1. Pré-visualização
    const previewQuery = `
      WITH RankedSongs AS (
        SELECT
          id,
          band_id,
          title,
          artist,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
            ORDER BY created_at ASC, id ASC
          ) as row_num,
          FIRST_VALUE(id) OVER (
            PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
            ORDER BY created_at ASC, id ASC
          ) as keep_id
        FROM songs
      )
      SELECT
        id AS duplicate_id,
        keep_id,
        band_id,
        title,
        artist,
        created_at
      FROM RankedSongs
      WHERE row_num > 1;
    `;

    const { rows: duplicates } = await client.query(previewQuery);
    console.log(`[Pré-visualização] ${duplicates.length} música(s) duplicada(s) encontrada(s):`);
    for (const dup of duplicates) {
      console.log(`  - "${dup.title}" (${dup.artist}) [Dup ID: ${dup.duplicate_id} -> Mantido: ${dup.keep_id}]`);
    }

    if (duplicates.length > 0) {
      await client.query("BEGIN");

      // 2. Atualizar referências em playlist_songs
      await client.query(`
        WITH DuplicatesMapping AS (
          SELECT
            id AS duplicate_id,
            FIRST_VALUE(id) OVER (
              PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
              ORDER BY created_at ASC, id ASC
            ) AS keep_id
          FROM songs
        )
        UPDATE playlist_songs ps
        SET song_id = dm.keep_id
        FROM DuplicatesMapping dm
        WHERE ps.song_id = dm.duplicate_id
          AND dm.duplicate_id != dm.keep_id;
      `);

      // 3. Remover duplicatas em playlist_songs
      await client.query(`
        DELETE FROM playlist_songs a
        USING playlist_songs b
        WHERE a.playlist_id = b.playlist_id
          AND a.song_id = b.song_id
          AND a.position > b.position;
      `);

      // 4. Deletar músicas duplicadas
      await client.query(`
        WITH RankedSongs AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
              ORDER BY created_at ASC, id ASC
            ) as row_num
          FROM songs
        )
        DELETE FROM songs
        WHERE id IN (
          SELECT id FROM RankedSongs WHERE row_num > 1
        );
      `);

      await client.query("COMMIT");
      console.log("✓ Músicas duplicadas removidas com sucesso e referências atualizadas!");
    } else {
      console.log("Nenhuma duplicata para remover no momento.");
    }

    // 5. Criar constraint / índice único
    console.log("Criando índice único para evitar futuras duplicatas...");
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS songs_band_title_artist_idx
      ON songs (band_id, lower(trim(title)), lower(trim(artist)));
    `);
    console.log("✓ Índice único criado com sucesso!");

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Erro ao executar desduplicação:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runDeduplication();
