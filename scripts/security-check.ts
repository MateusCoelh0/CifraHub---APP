import "dotenv/config";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import WebSocket from "ws";
import { errorHandler } from "../src/middleware/errorHandler.js";

const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";

/** Confere resposta do middleware global sem expor mensagem ou pilha internas. */
function checkHiddenServerError(): void {
  let body: unknown;
  let status = 0;
  const response = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const error = Object.assign(new Error("STACK_TRACE_SENTINELA"), { status: 500 });
  errorHandler(error, {} as Request, response, () => undefined);
  assert.equal(status, 500);
  assert.equal(JSON.stringify(body).includes("STACK_TRACE_SENTINELA"), false);
  assert.equal(JSON.stringify(body).includes("Erro interno do servidor."), true);
}

/** Faz verificações HTTP de origem, cabeçalhos, validação e limite de login. */
async function checkHttpSecurity(): Promise<void> {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200, "A interface legada deve continuar respondendo.");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.ok(home.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));

  const foreignOrigin = await fetch(`${baseUrl}/`, { headers: { origin: "https://fora.example" } });
  assert.equal(foreignOrigin.status, 403, "Origem desconhecida deve ser bloqueada.");

  const extraField = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Inválido",
      email: "extra@example.test",
      password: "SenhaValida123",
      admin: true,
    }),
  });
  assert.equal(extraField.status, 400, "Campos extras precisam ser rejeitados.");
  const validation = (await extraField.json()) as { success?: boolean; error?: { code?: string } };
  assert.equal(validation.success, false);
  assert.equal(validation.error?.code, "BAD_REQUEST");

  let limited = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nao-existe@example.test", password: "senha-incorreta" }),
    });
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.equal(
    limited,
    true,
    "O limite de tentativas de autenticação precisa bloquear força bruta.",
  );
}

/** Confere rejeição da origem estrangeira e limite de comandos no WebSocket. */
async function checkWebSocketSecurity(): Promise<void> {
  const parsed = new URL(baseUrl);
  const scheme = parsed.protocol === "https:" ? "wss:" : "ws:";
  const target = `${scheme}//${parsed.host}/`;
  const rejected = await new Promise<boolean>((resolve) => {
    const socket = new WebSocket(target, { origin: "https://fora.example" });
    socket.once("open", () => {
      socket.close();
      resolve(false);
    });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode === 403);
    });
    socket.once("error", () => resolve(true));
  });
  assert.equal(rejected, true, "Handshake WebSocket deve negar origem desconhecida.");

  const socket = new WebSocket(target);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { type: string };
      if (message.type === "init") resolve();
    });
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "transpose", value: 3, admin: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    socket.readyState,
    WebSocket.OPEN,
    "Mensagem com campo extra deve ser descartada sem encerrar a sala.",
  );
  const closeCode = await new Promise<number>((resolve) => {
    socket.once("close", (code) => resolve(code));
    for (let attempt = 0; attempt < 140 && socket.readyState === WebSocket.OPEN; attempt++)
      socket.send(JSON.stringify({ type: "transpose", value: 1 }));
  });
  assert.equal(closeCode, 1008, "Rajada de comandos deve encerrar a conexão abusiva.");
}

checkHiddenServerError();
await checkHttpSecurity();
await checkWebSocketSecurity();
console.log(
  "Segurança OK: cabeçalhos, CORS, schemas, rate limits HTTP/WS, origem e erro 500 seguro.",
);
