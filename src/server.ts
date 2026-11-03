import { extrairCifraClub } from "./utils/cifraUtils.js";
import "dotenv/config";
import "express-async-errors";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { pool, loadBandLibrary } from "./db/repository.js";
import { config } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRoutes } from "./routes/authRoutes.js";
import { createBandRoutes } from "./routes/bandRoutes.js";
import { emptyQuerySchema } from "./security/schemas.js";
import { validateRequest } from "./security/validateRequest.js";
import { WebSocketSessionService } from "./ws/websocketServer.js";

const HTTP_PORT = Number(process.env.PORT ?? 3000);
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const API_REQUEST_LIMIT = process.env.NODE_ENV === "production" ? 100 : 5000;
const AUTH_REQUEST_LIMIT = process.env.NODE_ENV === "production" ? 100 : 1000;
const directory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(directory, "..", "public");
const app = express();
const server = createServer(app);
const webSocketServer = new WebSocketServer({
  server,
  maxPayload: 16 * 1024,
  verifyClient: (info, done) => {
    const forwardedProtocol = info.req.headers["x-forwarded-proto"]
      ?.toString()
      .split(",")[0]
      .trim();
    const protocol =
      forwardedProtocol ??
      (config.corsOrigins.some((origin) => origin.startsWith("https://")) ? "https" : "http");
    const accepted = originAllowed(info.origin, info.req.headers.host ?? "", protocol);
    done(accepted, 403, "Origem não permitida.");
  },
});
let sessionService: WebSocketSessionService | null = null;

/** Confere a origem permitida pela lista explícita ou pela origem da aplicação.
 * @param origin Origem enviada pelo navegador.
 * @param host Host recebido pelo servidor.
 * @param protocol Protocolo HTTP ou HTTPS da aplicação.
 * @returns Verdadeiro quando a origem é permitida.
 */
function originAllowed(origin: string | undefined, host: string, protocol: string): boolean {
  if (!origin) return true;
  if (config.corsOrigins.length) return config.corsOrigins.includes(origin);
  return origin === `${protocol}://${host}`;
}

/** Configura cabeçalhos, CORS, limites HTTP, rotas e tratamento central de erros. */
function configureHttpApplication(): void {
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          styleSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors((request, callback) => {
      const origin = request.header("Origin");
      if (originAllowed(origin, request.header("host") ?? "", request.secure ? "https" : "http")) {
        callback(null, {
          origin: origin ?? false,
          credentials: false,
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
          allowedHeaders: ["Authorization", "Content-Type"],
        });
        return;
      }
      callback(Object.assign(new Error("Origem não permitida."), { status: 403 }));
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: REQUEST_WINDOW_MS,
      limit: API_REQUEST_LIMIT,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_request, response) =>
        response.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Limite de requisições atingido. Tente novamente mais tarde.",
          },
        }),
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: REQUEST_WINDOW_MS,
      limit: AUTH_REQUEST_LIMIT,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_request, response) =>
        response.status(429).json({
          success: false,
          error: {
            code: "AUTH_RATE_LIMITED",
            message: "Muitas tentativas de autenticação. Aguarde 15 minutos.",
          },
        }),
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", validateRequest("query", emptyQuerySchema));
  app.use(express.static(publicDirectory, { index: false }));
  app.get("/", (_request, response) => response.sendFile(join(publicDirectory, "index.html")));
  app.get("/legacy", (_request, response) =>
    response.sendFile(join(directory, "..", "index.html")),
  );
  app.post("/api/import-cifra", async (req, res) => {
    try {
      const { url } = req.body ?? {};
      if (!url || typeof url !== "string") {
        res.status(400).json({ success: false, error: "Link do Cifra Club obrigatório." });
        return;
      }
      const data = await extrairCifraClub(url.trim());
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Falha ao importar cifra." });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use(
    "/api/bands",
    createBandRoutes(
      (sessionId) => sessionService?.connectedDevices(sessionId) ?? 0,
      (bandId, message) => sessionService?.broadcastToBand(bandId, message),
    ),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
}

/** Carrega a banda padrão, conecta os serviços e inicia a aplicação. */
async function startServer(): Promise<void> {
  if (!pool)
    throw new Error(
      "DATABASE_URL não configurada; use npm run start:legacy para o servidor antigo.",
    );
  const library = await loadBandLibrary(process.env.LEGACY_OWNER_EMAIL);
  configureHttpApplication();
  sessionService = new WebSocketSessionService(library);
  sessionService.attach(webSocketServer);
  server.listen(HTTP_PORT, "0.0.0.0", () =>
    console.log(
      `CifraHub TypeScript rodando em http://localhost:${HTTP_PORT}; ${library.songs.length} músicas carregadas.`,
    ),
  );
}

void startServer().catch((error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exitCode = 1;
});
