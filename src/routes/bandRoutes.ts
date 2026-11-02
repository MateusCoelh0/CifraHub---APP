import { Router } from "express";
import { requireAuth } from "../auth/authMiddleware.js";
import { addMember, createBand, createLiveSession, createSong, listBands, listMembers, listSessions, listSongs, removeMember, type BandRole } from "../services/bandService.js";

export function createBandRoutes(connectedCounts: (sessionId: string) => number): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/", async (req,res) => { try { res.json(await listBands(req.user!.id)); } catch(error) { sendError(res,error); } });
  router.post("/", async (req,res) => {
    const name = (req.body as {name?:string}).name?.trim();
    if (!name) { res.status(400).json({error:"Nome da banda obrigatório."}); return; }
    try { res.status(201).json(await createBand(req.user!,name)); } catch(error) { sendError(res,error); }
  });
  router.get("/:bandId/members", async (req,res) => {
    try { res.json(await listMembers(req.params.bandId,req.user!.id)); }
    catch(error) { sendError(res,error); }
  });
  router.post("/:bandId/members", async (req,res) => {
    try {
      const {email,role} = req.body as {email?:string;role?:BandRole};
      if (!email || !["ADMIN","MEMBER","VIEWER"].includes(role ?? "")) { res.status(400).json({error:"E-mail e papel ADMIN, MEMBER ou VIEWER são obrigatórios."}); return; }
      await addMember(req.params.bandId,req.user!.id,email,role!); res.status(201).json({ok:true});
    } catch(error) { sendError(res,error); }
  });
  router.delete("/:bandId/members/:userId", async (req,res) => {
    try { await removeMember(req.params.bandId,req.user!.id,req.params.userId); res.status(204).end(); }
    catch(error) { sendError(res,error); }
  });
  router.get("/:bandId/songs", async (req,res) => {
    try { res.json(await listSongs(req.params.bandId,req.user!.id)); }
    catch(error) { sendError(res,error); }
  });
  router.post("/:bandId/songs", async (req,res) => {
    try {
      const song = req.body as {title?:string;artist?:string;key?:string;tempo?:number;cifra?:string};
      if (!song.title?.trim()) { res.status(400).json({error:"Título obrigatório."}); return; }
      res.status(201).json(await createSong(req.params.bandId,req.user!.id,{title:song.title.trim(),artist:song.artist ?? "",key:song.key ?? "C",tempo:song.tempo ?? 120,cifra:song.cifra ?? ""}));
    } catch(error) { sendError(res,error); }
  });
  router.post("/:bandId/sessions", async (req,res) => {
    try { res.status(201).json(await createLiveSession(req.params.bandId,req.user!.id,(req.body as {playlistId?:string}).playlistId)); }
    catch(error) { sendError(res,error); }
  });
  router.get("/:bandId/sessions", async (req,res) => {
    try { res.json(await listSessions(req.params.bandId,req.user!.id,connectedCounts)); }
    catch(error) { sendError(res,error); }
  });
  return router;
}

function sendError(res: import("express").Response,error:unknown): void {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  res.status(status).json({error:error instanceof Error ? error.message : "Erro interno."});
}
