import { pool } from "../db/repository.js";
import type { Song } from "../domain/entities.js";
import type { AuthUser } from "../auth/authService.js";

export type BandRole = "ADMIN" | "MEMBER" | "VIEWER";
const editableRoles: BandRole[] = ["ADMIN", "MEMBER"];

function db() { if (!pool) throw new Error("Banco PostgreSQL indisponível."); return pool; }

export async function createBand(user: AuthUser, name: string) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("INSERT INTO bands (name,created_by) VALUES ($1,$2) RETURNING id::text,name,created_at AS \"createdAt\"", [name.trim(), user.id]);
    await client.query("INSERT INTO band_members (band_id,user_id,role) VALUES ($1,$2,'ADMIN')", [rows[0].id, user.id]);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listBands(userId: string) {
  const { rows } = await db().query(`SELECT b.id::text,b.name,b.created_at AS "createdAt",bm.role
    FROM bands b JOIN band_members bm ON bm.band_id=b.id WHERE bm.user_id=$1 ORDER BY b.created_at`, [userId]);
  return rows;
}

export async function requireBandRole(bandId: string, userId: string, roles?: BandRole[]): Promise<BandRole> {
  const { rows } = await db().query("SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2", [bandId,userId]);
  if (!rows[0]) throw Object.assign(new Error("Você não pertence a esta banda."), { status: 403 });
  const role = rows[0].role as BandRole;
  if (roles && !roles.includes(role)) throw Object.assign(new Error("Seu papel não permite esta ação."), { status: 403 });
  return role;
}

export async function listMembers(bandId: string, userId: string) {
  await requireBandRole(bandId,userId);
  const { rows } = await db().query(`SELECT u.id::text,u.email,u.display_name AS "displayName",bm.role,bm.joined_at AS "joinedAt"
    FROM band_members bm JOIN users u ON u.id=bm.user_id WHERE bm.band_id=$1 ORDER BY bm.joined_at`, [bandId]);
  return rows;
}

export async function addMember(bandId: string, actorId: string, email: string, role: BandRole) {
  await requireBandRole(bandId,actorId,["ADMIN"]);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE lower(email)=lower($1)", [email.trim()]);
    if (!user.rowCount) throw Object.assign(new Error("Usuário não encontrado; ele precisa criar uma conta primeiro."), { status: 404 });
    await client.query(`INSERT INTO band_members (band_id,user_id,role) VALUES ($1,$2,$3)
      ON CONFLICT (band_id,user_id) DO UPDATE SET role=EXCLUDED.role`, [bandId,user.rows[0].id,role]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function removeMember(bandId: string, actorId: string, userId: string): Promise<void> {
  await requireBandRole(bandId,actorId,["ADMIN"]);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2 FOR UPDATE", [bandId,userId]);
    if (rows[0]?.role === "ADMIN") {
      const admins = await client.query("SELECT count(*)::int AS total FROM band_members WHERE band_id=$1 AND role='ADMIN'", [bandId]);
      if (admins.rows[0].total <= 1) throw Object.assign(new Error("A banda precisa manter pelo menos um ADMIN."), { status: 409 });
    }
    await client.query("DELETE FROM band_members WHERE band_id=$1 AND user_id=$2", [bandId,userId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listSongs(bandId: string, userId: string): Promise<Song[]> {
  await requireBandRole(bandId,userId);
  const { rows } = await db().query(`SELECT id::text,title,artist,musical_key AS key,tempo,lyrics AS cifra
    FROM songs WHERE band_id=$1 ORDER BY created_at,id`, [bandId]);
  return rows;
}

export async function createSong(bandId: string, userId: string, song: Omit<Song,"id">): Promise<Song> {
  await requireBandRole(bandId,userId,editableRoles);
  const { rows } = await db().query(`INSERT INTO songs (band_id,title,artist,musical_key,tempo,lyrics)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text,title,artist,musical_key AS key,tempo,lyrics AS cifra`,
  [bandId,song.title,song.artist,song.key,song.tempo,song.cifra]);
  return rows[0];
}

export async function createLiveSession(bandId: string, userId: string, playlistId?: string) {
  await requireBandRole(bandId,userId,editableRoles);
  const { rows } = await db().query(`INSERT INTO sessions (band_id,playlist_id,created_by,status,started_at)
    VALUES ($1,$2,$3,'LIVE',now()) RETURNING id::text,band_id::text AS "bandId",playlist_id::text AS "playlistId",status,created_at AS "createdAt",started_at AS "startedAt"`,
  [bandId,playlistId || null,userId]);
  return rows[0];
}

export async function listSessions(bandId: string, userId: string, connectedCounts: (sessionId: string) => number) {
  await requireBandRole(bandId,userId);
  const { rows } = await db().query(`SELECT id::text,band_id::text AS "bandId",status,created_at AS "createdAt",started_at AS "startedAt"
    FROM sessions WHERE band_id=$1 AND status='LIVE' ORDER BY started_at DESC`, [bandId]);
  return rows.map(session => ({ ...session, connectedDevices: connectedCounts(session.id) }));
}
