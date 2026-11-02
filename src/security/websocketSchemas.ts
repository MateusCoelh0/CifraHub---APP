import { z } from "zod";
import type { ClientMessage } from "../types/websocket.js";

const cleanText = (maximum: number): z.ZodType<string> =>
  z
    .string()
    .max(maximum)
    .transform((value) => value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, ""));
const lyrics = cleanText(50_000);
const song = z
  .object({
    id: z.string().min(1).max(100),
    title: cleanText(200),
    artist: cleanText(200),
    key: cleanText(12),
    tempo: z.number().int().min(1).max(400),
    cifra: lyrics,
  })
  .strict();
const setlist = z
  .object({
    id: z.string().max(100),
    name: cleanText(200).pipe(z.string().min(1)),
    songs: z.array(z.string().max(100)).max(500),
  })
  .strict();
/** Schema discriminado que rejeita tipos desconhecidos e campos não previstos. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setDeviceName"), name: cleanText(100) }).strict(),
  z.object({ type: z.literal("requestState") }).strict(),
  z.object({ type: z.literal("selectSong"), song, index: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal("selectSetlist"), setlist }).strict(),
  z.object({ type: z.literal("transpose"), value: z.number().int().min(-24).max(24) }).strict(),
  z.object({ type: z.literal("capotraste"), value: z.number().int().min(0).max(24) }).strict(),
  z.object({ type: z.literal("autoScroll"), speed: z.number().min(0).max(100) }).strict(),
  z.object({ type: z.literal("scroll"), position: z.number().min(0).max(1_000_000) }).strict(),
  z.object({ type: z.literal("stageMode"), enabled: z.boolean() }).strict(),
  z.object({ type: z.enum(["nextSong", "previousSong"]) }).strict(),
  z
    .object({
      type: z.literal("addSong"),
      title: cleanText(200).optional(),
      artist: cleanText(200).optional(),
      key: cleanText(12).optional(),
      tempo: z.number().int().min(1).max(400).optional(),
      cifra: lyrics.optional(),
    })
    .strict(),
  z.object({ type: z.literal("updateSong"), song }).strict(),
  z
    .object({ type: z.enum(["deleteSong", "deleteSetlist"]), id: z.string().min(1).max(100) })
    .strict(),
  z
    .object({
      type: z.literal("createSetlist"),
      name: cleanText(200).optional(),
      songs: z.array(z.string().max(100)).max(500).optional(),
    })
    .strict(),
  z.object({ type: z.literal("updateSetlist"), setlist }).strict(),
  z.object({ type: z.literal("transferHost"), targetClientId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("claimHost") }).strict(),
]);

/** Valida uma mensagem JSON não confiável conforme o protocolo WebSocket.
 * @param raw Texto JSON recebido do cliente.
 * @returns Mensagem tipada ou null quando o conteúdo é inválido.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = clientMessageSchema.safeParse(value);
    return parsed.success ? (parsed.data as ClientMessage) : null;
  } catch {
    return null;
  }
}
