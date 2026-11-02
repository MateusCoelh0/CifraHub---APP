import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

/** Retorna resposta padronizada para rotas inexistentes.
 * @param _request Requisição original, não utilizada.
 * @param response Resposta HTTP a enviar.
 * @returns Nenhum valor; encerra a resposta com HTTP 404.
 */
export const notFoundHandler: RequestHandler = (_request, response) => {
  response
    .status(404)
    .json({ success: false, error: { code: "NOT_FOUND", message: "Rota não encontrada." } });
};

/** Converte exceções em JSON seguro e mantém detalhes internos apenas nos logs.
 * @param error Exceção levantada pela aplicação ou por um middleware.
 * @param _request Requisição original, não utilizada.
 * @param response Resposta HTTP a enviar.
 * @param _next Continuação do Express, não utilizada após tratar o erro.
 * @returns Nenhum valor; encerra a resposta com o código HTTP apropriado.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = Number(error?.status ?? error?.statusCode ?? 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const code =
    safeStatus === 400
      ? "BAD_REQUEST"
      : safeStatus === 401
        ? "UNAUTHORIZED"
        : safeStatus === 403
          ? "FORBIDDEN"
          : safeStatus === 404
            ? "NOT_FOUND"
            : safeStatus === 409
              ? "CONFLICT"
              : "INTERNAL_ERROR";
  const message =
    error instanceof ZodError
      ? "Dados inválidos."
      : safeStatus < 500
        ? String(error.message ?? "Requisição inválida.")
        : "Erro interno do servidor.";
  if (safeStatus >= 500) console.error("Erro interno da requisição:", error);
  response.status(safeStatus).json({ success: false, error: { code, message } });
};
