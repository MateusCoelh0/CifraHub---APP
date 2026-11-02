import { randomInt } from "node:crypto";
import { pool, removePlaylist, removeSong, savePlaylist, updateSong } from "../db/repository.js";
import type { Setlist, Song } from "../domain/entities.js";
import type { AuthUser } from "../auth/authService.js";
import type { Pool } from "pg";

export type BandRole = "ADMIN" | "MEMBER" | "VIEWER";
const editableRoles: BandRole[] = ["ADMIN", "MEMBER"];

export interface BandSummary {
  id: string;
  name: string;
  createdAt: Date;
  role?: BandRole;
}
export interface MemberSummary {
  id: string;
  email: string;
  displayName: string;
  role: BandRole;
  joinedAt: Date;
}
export interface LiveSessionSummary {
  id: string;
  bandId: string;
  code: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  connectedDevices?: number;
}

function db(): Pool {
  if (!pool) throw new Error("Banco PostgreSQL indisponível.");
  return pool;
}

/** Cria uma banda e registra o usuário criador como ADMIN na mesma transação.
 * @param user Usuário autenticado que cria a banda.
 * @param name Nome validado da nova banda.
 * @returns Resumo da banda criada.
 */
export async function createBand(user: AuthUser, name: string): Promise<BandSummary> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      'INSERT INTO bands (name,created_by) VALUES ($1,$2) RETURNING id::text,name,created_at AS "createdAt"',
      [name.trim(), user.id],
    );
    await client.query("INSERT INTO band_members (band_id,user_id,role) VALUES ($1,$2,'ADMIN')", [
      rows[0].id,
      user.id,
    ]);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Lista apenas bandas das quais o usuário faz parte.
 * @param userId Identificador do usuário autenticado.
 * @returns Bandas e papéis associados ao usuário.
 */
export async function listBands(userId: string): Promise<BandSummary[]> {
  const { rows } = await db().query(
    `SELECT b.id::text,b.name,b.created_at AS "createdAt",bm.role
    FROM bands b JOIN band_members bm ON bm.band_id=b.id WHERE bm.user_id=$1 ORDER BY b.created_at`,
    [userId],
  );
  return rows;
}

/** Confirma pertencimento e, quando solicitado, o papel mínimo na banda.
 * @param bandId Banda que será acessada.
 * @param userId Usuário autenticado.
 * @param roles Papéis permitidos para a ação atual.
 * @returns Papel do usuário na banda.
 * @throws Erro HTTP 403 se não houver vínculo ou permissão.
 */
export async function requireBandRole(
  bandId: string,
  userId: string,
  roles?: BandRole[],
): Promise<BandRole> {
  const { rows } = await db().query(
    "SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2",
    [bandId, userId],
  );
  if (!rows[0]) throw Object.assign(new Error("Você não pertence a esta banda."), { status: 403 });
  const role = rows[0].role as BandRole;
  if (roles && !roles.includes(role))
    throw Object.assign(new Error("Seu papel não permite esta ação."), { status: 403 });
  return role;
}

/** Lista integrantes após confirmar que o solicitante pertence à banda.
 * @param bandId Banda consultada.
 * @param userId Solicitante autenticado.
 * @returns Integrantes e seus papéis.
 */
export async function listMembers(bandId: string, userId: string): Promise<MemberSummary[]> {
  await requireBandRole(bandId, userId);
  const { rows } = await db().query(
    `SELECT u.id::text,u.email,u.display_name AS "displayName",bm.role,bm.joined_at AS "joinedAt"
    FROM band_members bm JOIN users u ON u.id=bm.user_id WHERE bm.band_id=$1 ORDER BY bm.joined_at`,
    [bandId],
  );
  return rows;
}

/** Adiciona ou atualiza um integrante; somente ADMIN pode gerenciar membros.
 * @param bandId Banda alterada.
 * @param actorId Administrador que executa a ação.
 * @param email E-mail cadastrado do integrante.
 * @param role Papel atribuído ao integrante.
 */
export async function addMember(
  bandId: string,
  actorId: string,
  email: string,
  role: BandRole,
): Promise<void> {
  await requireBandRole(bandId, actorId, ["ADMIN"]);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE lower(email)=lower($1)", [
      email.trim(),
    ]);
    if (!user.rowCount)
      throw Object.assign(
        new Error("Usuário não encontrado; ele precisa criar uma conta primeiro."),
        { status: 404 },
      );
    await client.query(
      `INSERT INTO band_members (band_id,user_id,role) VALUES ($1,$2,$3)
      ON CONFLICT (band_id,user_id) DO UPDATE SET role=EXCLUDED.role`,
      [bandId, user.rows[0].id, role],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Remove integrante sem permitir a exclusão do último administrador.
 * @param bandId Banda alterada.
 * @param actorId Administrador que executa a ação.
 * @param userId Integrante removido.
 */
export async function removeMember(bandId: string, actorId: string, userId: string): Promise<void> {
  await requireBandRole(bandId, actorId, ["ADMIN"]);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT role FROM band_members WHERE band_id=$1 AND user_id=$2 FOR UPDATE",
      [bandId, userId],
    );
    if (rows[0]?.role === "ADMIN") {
      const admins = await client.query(
        "SELECT count(*)::int AS total FROM band_members WHERE band_id=$1 AND role='ADMIN'",
        [bandId],
      );
      if (admins.rows[0].total <= 1)
        throw Object.assign(new Error("A banda precisa manter pelo menos um ADMIN."), {
          status: 409,
        });
    }
    await client.query("DELETE FROM band_members WHERE band_id=$1 AND user_id=$2", [
      bandId,
      userId,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Lista repertório apenas para integrantes da banda.
 * @param bandId Banda consultada.
 * @param userId Usuário autenticado.
 * @returns Músicas pertencentes à banda.
 */
export async function listSongs(bandId: string, userId: string): Promise<Song[]> {
  await requireBandRole(bandId, userId);
  const { rows } = await db().query(
    `SELECT id::text,title,artist,musical_key AS key,tempo,lyrics AS cifra
    FROM songs WHERE band_id=$1 ORDER BY created_at,id`,
    [bandId],
  );
  return rows;
}

/** Lista setlists e músicas ordenadas após confirmar o vínculo do usuário com a banda.
 * @param bandId Banda consultada.
 * @param userId Usuário autenticado.
 * @returns Setlists disponíveis na banda.
 */
export async function listPlaylists(bandId: string, userId: string): Promise<Setlist[]> {
  await requireBandRole(bandId, userId);
  const { rows } = await db().query(
    `SELECT p.id::text, p.name, COALESCE(array_agg(ps.song_id::text ORDER BY ps.position)
       FILTER (WHERE ps.song_id IS NOT NULL), '{}') AS songs
     FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
     WHERE p.band_id = $1 GROUP BY p.id ORDER BY p.created_at, p.id`,
    [bandId],
  );
  return rows;
}

/** Cria música se o integrante tiver papel ADMIN ou MEMBER.
 * @param bandId Banda proprietária do repertório.
 * @param userId Usuário que cria a música.
 * @param song Dados validados da música.
 * @returns Registro persistido com UUID.
 */
export async function createSong(
  bandId: string,
  userId: string,
  song: Omit<Song, "id">,
): Promise<Song> {
  await requireBandRole(bandId, userId, editableRoles);
  const { rows } = await db().query(
    `INSERT INTO songs (band_id,title,artist,musical_key,tempo,lyrics)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text,title,artist,musical_key AS key,tempo,lyrics AS cifra`,
    [bandId, song.title, song.artist, song.key, song.tempo, song.cifra],
  );
  return rows[0];
}

/** Atualiza música da banda após conferir papel editável e propriedade.
 * @param bandId Banda proprietária.
 * @param userId Integrante solicitante.
 * @param song Música com identificador e campos atualizados.
 */
export async function editSong(bandId: string, userId: string, song: Song): Promise<void> {
  await requireBandRole(bandId, userId, editableRoles);
  if (!(await updateSong(bandId, song)))
    throw Object.assign(new Error("Música não encontrada."), { status: 404 });
}

/** Exclui música da banda após conferir papel editável.
 * @param bandId Banda proprietária.
 * @param userId Integrante solicitante.
 * @param songId Identificador da música.
 */
export async function deleteSong(bandId: string, userId: string, songId: string): Promise<void> {
  await requireBandRole(bandId, userId, editableRoles);
  if (!(await removeSong(bandId, songId)))
    throw Object.assign(new Error("Música não encontrada."), { status: 404 });
}

/** Cria/atualiza playlist e músicas ordenadas depois de validar permissões.
 * @param bandId Banda proprietária.
 * @param userId Integrante solicitante.
 * @param playlist Dados da playlist.
 * @returns Playlist persistida.
 */
export async function saveBandPlaylist(
  bandId: string,
  userId: string,
  playlist: Setlist,
): Promise<Setlist> {
  await requireBandRole(bandId, userId, editableRoles);
  return savePlaylist(bandId, playlist);
}

/** Remove playlist da banda após conferir papel editável.
 * @param bandId Banda proprietária.
 * @param userId Integrante solicitante.
 * @param playlistId Identificador da playlist.
 */
export async function deleteBandPlaylist(
  bandId: string,
  userId: string,
  playlistId: string,
): Promise<void> {
  await requireBandRole(bandId, userId, editableRoles);
  await removePlaylist(bandId, playlistId);
}

/** Cria sessão ao vivo vinculada à banda e, opcionalmente, à playlist da mesma banda.
 * @param bandId Banda proprietária da sessão.
 * @param userId Integrante que inicia a sessão.
 * @param playlistId Playlist opcional.
 * @returns Sessão persistida no estado LIVE.
 */
export async function createLiveSession(
  bandId: string,
  userId: string,
  playlistId?: string,
): Promise<LiveSessionSummary> {
  await requireBandRole(bandId, userId, editableRoles);
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      const { rows } = await db().query(
        `INSERT INTO sessions (band_id,playlist_id,created_by,status,started_at,session_code)
        VALUES ($1,$2,$3,'LIVE',now(),$4)
        RETURNING id::text,band_id::text AS "bandId",playlist_id::text AS "playlistId",
        session_code AS code,status,created_at AS "createdAt",started_at AS "startedAt"`,
        [bandId, playlistId || null, userId, code],
      );
      return rows[0];
    } catch (error) {
      const isCodeCollision =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "sessions_live_session_code_idx";
      if (!isCodeCollision) throw error;
    }
  }
  throw new Error("Não foi possível gerar um código de sessão único.");
}

/** Lista sessões ativas da banda e conta os dispositivos conectados em memória.
 * @param bandId Banda consultada.
 * @param userId Integrante autenticado.
 * @param connectedCounts Consulta local do número de conexões para uma sessão.
 * @returns Sessões ativas com contagem de dispositivos.
 */
export async function listSessions(
  bandId: string,
  userId: string,
  connectedCounts: (sessionId: string) => number,
): Promise<Array<LiveSessionSummary & { connectedDevices: number }>> {
  await requireBandRole(bandId, userId);
  const { rows } = await db().query(
    `SELECT id::text,band_id::text AS "bandId",session_code AS code,status,
       created_at AS "createdAt",started_at AS "startedAt"
    FROM sessions WHERE band_id=$1 AND status='LIVE' ORDER BY started_at DESC`,
    [bandId],
  );
  return rows.map((session) => ({ ...session, connectedDevices: connectedCounts(session.id) }));
}
