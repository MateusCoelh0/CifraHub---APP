import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { validationMessage } from "./schemas.js";

/** Valida uma parte da requisição e a substitui pelos dados já tratados.
 * @param target Parte da requisição que será validada.
 * @param schema Schema Zod que define os campos e formatos permitidos.
 * @returns Middleware que responde 400 ou continua a cadeia Express.
 */
export function validateRequest(target: "body" | "params" | "query", schema: ZodType) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(request[target]);
    if (!parsed.success) {
      response.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: validationMessage(parsed.error) },
      });
      return;
    }
    if (target === "query")
      Object.defineProperty(request, "query", {
        value: parsed.data,
        writable: true,
        configurable: true,
      });
    else
      Object.assign(request, target === "body" ? { body: parsed.data } : { params: parsed.data });
    next();
  };
}
