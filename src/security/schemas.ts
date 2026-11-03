import { z } from "zod";

const plainText = (max: number): z.ZodType<string> =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>]/.test(value), "Não use marcação HTML.")
    .transform((value) => value.replace(/[\u0000-\u001f\u007f]/g, ""));

export const registerSchema = z
  .object({
    name: plainText(100),
    email: z.string().email().max(254),
    password: z
      .string()
      .min(10)
      .max(128)
      .refine(
        (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
        "A senha precisa incluir maiúscula, minúscula e número.",
      ),
  })
  .strict();
export const loginSchema = z
  .object({ email: z.string().email().max(254), password: z.string().min(1).max(128) })
  .strict();
export const bandSchema = z.object({ name: plainText(100) }).strict();
export const memberSchema = z
  .object({ email: z.string().email().max(254), role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) })
  .strict();
export const songSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: plainText(200),
    artist: z
      .string()
      .max(200)
      .default("")
      .transform((v) => v.replace(/[<>]/g, "")),
    key: z
      .string()
      .max(12)
      .default("C")
      .transform((v) => v.replace(/[<>]/g, "")),
    tempo: z.number().int().min(1).max(400).default(120),
    cifra: z
      .string()
      .max(50_000)
      .default("")
      .transform((v) =>
        v.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""),
      ),
  })
  .strict();
export const sessionSchema = z.object({ playlistId: z.string().uuid().optional() }).strict();
export const playlistSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    songs: z.array(z.string().uuid()).max(500),
  })
  .strict();
export const emptyQuerySchema = z.object({}).strict();
export const bandIdParamsSchema = z.object({ bandId: z.string().uuid() }).passthrough();
export const memberParamsSchema = z
  .object({ bandId: z.string().uuid(), userId: z.string().uuid() })
  .passthrough();
export const songParamsSchema = z
  .object({ bandId: z.string().uuid(), songId: z.string().uuid() })
  .strict();
export const playlistParamsSchema = z
  .object({ bandId: z.string().uuid(), playlistId: z.string().uuid() })
  .strict();

/** Converte erros do Zod em uma mensagem segura com os campos inválidos.
 * @param error Erro produzido pela validação do schema.
 * @returns Mensagem sem valores sensíveis enviados pelo cliente.
 */
export function validationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

export const importCifraSchema = z
  .object({
    url: z.string().url().max(2000),
  })
  .strict();
