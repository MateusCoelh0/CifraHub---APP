import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL não definida. Crie o arquivo .env com base em .env.example.");
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });

  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'bands', 'band_members', 'songs', 'playlists', 'playlist_songs', 'sessions', 'session_members')
      ORDER BY table_name
    `);
    const tables = result.rows.map((row) => row.table_name);
    console.log(`Conectado ao PostgreSQL. Tabelas encontradas: ${tables.length}/8`);
    console.log(tables.join(", "));
    if (tables.length !== 8) process.exitCode = 1;
  } catch (error) {
    console.error("Falha ao conectar ou consultar o PostgreSQL:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
