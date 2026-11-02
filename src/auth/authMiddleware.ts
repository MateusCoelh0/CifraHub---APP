import type { NextFunction, Request, Response } from "express";
import { findUserById, verifyToken, type AuthUser } from "./authService.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Extrai token Bearer HTTP ou token de query usado no handshake WebSocket.
 * @param request Requisição que contém os cabeçalhos ou parâmetros.
 * @returns Token encontrado ou null.
 */
export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const queryToken = request.query.token;
  return typeof queryToken === "string" && queryToken ? queryToken : null;
}

/** Valida o token da requisição e carrega a conta atual do banco.
 * @param request Requisição de entrada.
 * @returns Conta autenticada ou null quando não há credencial.
 */
export async function authenticateRequest(request: Request): Promise<AuthUser | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const payload = verifyToken(token);
  return findUserById(payload.sub);
}

/** Middleware que exige identidade válida para a rota protegida.
 * @param request Requisição HTTP.
 * @param response Resposta HTTP.
 * @param next Continuação da cadeia Express.
 * @returns Nenhum valor; continua ou encerra a requisição.
 */
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Autenticação necessária." },
      });
      return;
    }
    request.user = user;
    next();
  } catch {
    response.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token ausente, inválido ou expirado." },
    });
  }
}
