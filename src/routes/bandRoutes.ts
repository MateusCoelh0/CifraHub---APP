import { Router } from "express";
import { requireAuth } from "../auth/authMiddleware.js";
import type { Song } from "../domain/entities.js";
import { validateRequest } from "../security/validateRequest.js";
import {
  bandIdParamsSchema,
  bandSchema,
  memberParamsSchema,
  memberSchema,
  sessionSchema,
  songSchema,
  playlistSchema,
  songParamsSchema,
  playlistParamsSchema,
} from "../security/schemas.js";
import {
  addMember,
  createBand,
  createLiveSession,
  createSong,
  editSong,
  deleteSong,
  saveBandPlaylist,
  deleteBandPlaylist,
  listBands,
  listMembers,
  listPlaylists,
  listSessions,
  listSongs,
  removeMember,
  type BandRole,
} from "../services/bandService.js";

/** Cria rotas protegidas de banda, membros, repertório e sessões.
 * @param connectedCounts Consulta a quantidade atual de dispositivos conectados.
 * @returns Roteador Express com as rotas /api/bands.
 */
export function createBandRoutes(
  connectedCounts: (sessionId: string) => number,
  notifyBand?: (bandId: string, message: import("../types/websocket.js").ServerMessage) => void,
): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/", async (req, res) => {
    try {
      res.json({ success: true, data: await listBands(req.user!.id) });
    } catch (error) {
      sendError(res, error);
    }
  });
  router.post("/", validateRequest("body", bandSchema), async (req, res) => {
    const name = (req.body as { name?: string }).name?.trim();
    if (!name) {
      res.status(400).json({ error: "Nome da banda obrigatório." });
      return;
    }
    try {
      res.status(201).json({ success: true, data: await createBand(req.user!, name) });
    } catch (error) {
      sendError(res, error);
    }
  });
  router.get(
    "/:bandId/members",
    validateRequest("params", bandIdParamsSchema),
    async (req, res) => {
      try {
        res.json({ success: true, data: await listMembers(req.params.bandId, req.user!.id) });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.post(
    "/:bandId/members",
    validateRequest("params", bandIdParamsSchema),
    validateRequest("body", memberSchema),
    async (req, res) => {
      try {
        const { email, role } = req.body as { email?: string; role?: BandRole };
        if (!email || !["ADMIN", "MEMBER", "VIEWER"].includes(role ?? "")) {
          res
            .status(400)
            .json({ error: "E-mail e papel ADMIN, MEMBER ou VIEWER são obrigatórios." });
          return;
        }
        await addMember(req.params.bandId, req.user!.id, email, role!);
        res.status(201).json({ ok: true });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.put(
    "/:bandId/songs/:songId",
    validateRequest("params", songParamsSchema),
    validateRequest("body", songSchema),
    async (req, res) => {
      try {
        const songData = {
          ...(req.body as Omit<Song, "id">),
          id: req.params.songId,
        };
        await editSong(req.params.bandId, req.user!.id, songData);
        notifyBand?.(req.params.bandId, { type: "songUpdated", song: songData });
        res.json({ success: true, data: songData });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.delete(
    "/:bandId/songs/:songId",
    validateRequest("params", songParamsSchema),
    async (req, res) => {
      try {
        await deleteSong(req.params.bandId, req.user!.id, req.params.songId);
        const playlists = await listPlaylists(req.params.bandId, req.user!.id);
        notifyBand?.(req.params.bandId, { type: "songDeleted", id: req.params.songId, setlists: playlists });
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.post(
    "/:bandId/playlists",
    validateRequest("params", bandIdParamsSchema),
    validateRequest("body", playlistSchema),
    async (req, res) => {
      try {
        const playlist = await saveBandPlaylist(req.params.bandId, req.user!.id, {
          ...(req.body as { name: string; songs: string[] }),
          id: "",
        });
        notifyBand?.(req.params.bandId, { type: "setlistCreated", setlist: playlist });
        res.status(201).json({ success: true, data: playlist });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.put(
    "/:bandId/playlists/:playlistId",
    validateRequest("params", playlistParamsSchema),
    validateRequest("body", playlistSchema),
    async (req, res) => {
      try {
        const playlist = await saveBandPlaylist(req.params.bandId, req.user!.id, {
          ...(req.body as { name: string; songs: string[] }),
          id: req.params.playlistId,
        });
        notifyBand?.(req.params.bandId, { type: "setlistUpdated", setlist: playlist });
        res.json({ success: true, data: playlist });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.delete(
    "/:bandId/playlists/:playlistId",
    validateRequest("params", playlistParamsSchema),
    async (req, res) => {
      try {
        await deleteBandPlaylist(req.params.bandId, req.user!.id, req.params.playlistId);
        notifyBand?.(req.params.bandId, { type: "setlistDeleted", id: req.params.playlistId });
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.delete(
    "/:bandId/members/:userId",
    validateRequest("params", memberParamsSchema),
    async (req, res) => {
      try {
        await removeMember(req.params.bandId, req.user!.id, req.params.userId);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.get("/:bandId/songs", validateRequest("params", bandIdParamsSchema), async (req, res) => {
    try {
      res.json({ success: true, data: await listSongs(req.params.bandId, req.user!.id) });
    } catch (error) {
      sendError(res, error);
    }
  });
  router.get(
    "/:bandId/playlists",
    validateRequest("params", bandIdParamsSchema),
    async (req, res) => {
      try {
        res.json({ success: true, data: await listPlaylists(req.params.bandId, req.user!.id) });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.post(
    "/:bandId/songs",
    validateRequest("params", bandIdParamsSchema),
    validateRequest("body", songSchema),
    async (req, res) => {
      try {
        const song = req.body as {
          title?: string;
          artist?: string;
          key?: string;
          tempo?: number;
          cifra?: string;
        };
        if (!song.title?.trim()) {
          res.status(400).json({ error: "Título obrigatório." });
          return;
        }
        const created = await createSong(req.params.bandId, req.user!.id, {
          title: song.title.trim(),
          artist: song.artist ?? "",
          key: song.key ?? "C",
          tempo: song.tempo ?? 120,
          cifra: song.cifra ?? "",
        });
        notifyBand?.(req.params.bandId, { type: "songAdded", song: created });
        res.status(201).json({ success: true, data: created });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.post(
    "/:bandId/sessions",
    validateRequest("params", bandIdParamsSchema),
    validateRequest("body", sessionSchema),
    async (req, res) => {
      try {
        res
          .status(201)
          .json(
            await createLiveSession(
              req.params.bandId,
              req.user!.id,
              (req.body as { playlistId?: string }).playlistId,
            ),
          );
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  router.get(
    "/:bandId/sessions",
    validateRequest("params", bandIdParamsSchema),
    async (req, res) => {
      try {
        res.json({
          success: true,
          data: await listSessions(req.params.bandId, req.user!.id, connectedCounts),
        });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
  return router;
}

function sendError(res: import("express").Response, error: unknown): void {
  const status =
    typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const code =
    status === 403
      ? "FORBIDDEN"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : status === 400
            ? "BAD_REQUEST"
            : "INTERNAL_ERROR";
  res.status(status).json({
    success: false,
    error: {
      code,
      message:
        status >= 500
          ? "Erro interno do servidor."
          : error instanceof Error
            ? error.message
            : "Erro interno.",
    },
  });
}
