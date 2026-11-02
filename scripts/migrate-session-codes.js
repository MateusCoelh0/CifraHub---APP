import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const directory = dirname(fileURLToPath(import.meta.url));

/** Aplica a migração que adiciona códigos de entrada às sessões ao vivo. */
async function migrateSessionCodes() {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL antes da migração.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migration = await readFile(
      join(directory, "..", "migrations", "002_session_access_codes.sql"),
      "utf8",
    );
    await pool.query(migration);
    console.log("Migração de códigos de sessão aplicada.");
  } finally {
    await pool.end();
  }
}

await migrateSessionCodes();
