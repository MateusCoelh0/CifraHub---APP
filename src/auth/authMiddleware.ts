import type { NextFunction, Request, Response } from "express";
import { findUserById, verifyToken, type AuthUser } from "./authService.js";

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const queryToken = request.query.token;
  return typeof queryToken === "string" && queryToken ? queryToken : null;
}

export async function authenticateRequest(request: Request): Promise<AuthUser | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const payload = verifyToken(token);
  return findUserById(payload.sub);
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authenticateRequest(request);
    if (!user) { response.status(401).json({ error: "Autenticação necessária." }); return; }
    request.user = user;
    next();
  } catch { response.status(401).json({ error: "Token ausente, inválido ou expirado." }); }
}
