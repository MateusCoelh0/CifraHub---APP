import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import WebSocket from "ws";

const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const suffix = randomUUID().slice(0, 8);
const emailA = `api-a-${suffix}@example.test`;
const emailB = `api-b-${suffix}@example.test`;
const password = `Test-${randomUUID()}-Strong!`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function request(path, method = "GET", token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}
function connectSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queue = [];
    const waiters = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const i = waiters.findIndex((waiter) => waiter.type === message.type);
      if (i >= 0) {
        const waiter = waiters.splice(i, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else queue.push(message);
    });
    socket.once("open", () =>
      resolve({
        socket,
        wait(type, timeout = 3000) {
          const i = queue.findIndex((message) => message.type === type);
          if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
          return new Promise((resolve, reject) => {
            const waiter = {
              type,
              resolve,
              reject,
              timer: setTimeout(() => reject(new Error(`WebSocket timeout: ${type}`)), timeout),
            };
            waiters.push(waiter);
          });
        },
      }),
    );
    socket.once("error", reject);
  });
}
let userAId;
let userBId;
let bandAId;
try {
  const root = await fetch(`${baseUrl}/`);
  assert(root.status === 200, "A rota legada / não entregou a interface.");
  const regA = await request("/api/auth/register", "POST", null, {
    name: "User A",
    email: emailA,
    password,
  });
  const regB = await request("/api/auth/register", "POST", null, {
    name: "User B",
    email: emailB,
    password,
  });
  assert(regA.status === 201 && regB.status === 201, "Cadastro dos dois usuários falhou.");
  const loginA = await request("/api/auth/login", "POST", null, { email: emailA, password });
  const loginB = await request("/api/auth/login", "POST", null, { email: emailB, password });
  assert(loginA.status === 200 && loginB.status === 200, "Login de teste falhou.");
  const tokenA = loginA.data.token;
  const tokenB = loginB.data.token;
  userAId = loginA.data.user.id;
  userBId = loginB.data.user.id;
  const bandA = await request("/api/bands", "POST", tokenA, { name: `Banda 1 ${suffix}` });
  const bandB = await request("/api/bands", "POST", tokenB, { name: `Banda 2 ${suffix}` });
  assert(bandA.status === 201 && bandB.status === 201, "Criação de bandas falhou.");
  bandAId = bandA.data.data.id;
  assert(Boolean(bandB.data.data.id), "Banda 2 deve retornar identificador.");
  const song = await request(`/api/bands/${bandAId}/songs`, "POST", tokenA, {
    title: "Canção isolada",
    artist: "Teste",
    key: "C",
    tempo: 100,
    cifra: "[C]Teste",
  });
  assert(song.status === 201, "User A não conseguiu criar música na Banda 1.");
  const crossRead = await request(`/api/bands/${bandAId}/songs`, "GET", tokenB);
  const crossWrite = await request(`/api/bands/${bandAId}/songs`, "POST", tokenB, {
    title: "Invasão",
  });
  assert(
    crossRead.status === 403 && crossWrite.status === 403,
    "A Banda 1 não foi isolada para User B.",
  );
  const addViewer = await request(`/api/bands/${bandAId}/members`, "POST", tokenA, {
    email: emailB,
    role: "VIEWER",
  });
  const viewerRead = await request(`/api/bands/${bandAId}/songs`, "GET", tokenB);
  const viewerWrite = await request(`/api/bands/${bandAId}/songs`, "POST", tokenB, {
    title: "Edição não permitida",
  });
  assert(
    addViewer.status === 201 && viewerRead.status === 200 && viewerWrite.status === 403,
    "VIEWER não respeitou acesso somente leitura.",
  );
  const session = await request(`/api/bands/${bandAId}/sessions`, "POST", tokenA, {});
  assert(
    session.status === 201 && session.data.bandId === bandAId,
    "Criação de sessão na Banda 1 falhou.",
  );
  const guest = await connectSocket(
    `ws://localhost:${new URL(baseUrl).port || "80"}/?sessionId=${session.data.id}`,
  );
  const guestInit = await guest.wait("init");
  assert(!guestInit.isHost, "Convidado deveria entrar como visualizador sem login.");
  const admin = await connectSocket(
    `ws://localhost:${new URL(baseUrl).port || "80"}/?sessionId=${session.data.id}&token=${encodeURIComponent(tokenA)}`,
  );
  const adminInit = await admin.wait("init");
  assert(adminInit.isHost, "ADMIN deveria assumir controle quando conecta.");
  const guestUpdate = guest.wait("transposeUpdated");
  const blockedControl = admin.wait("transposeUpdated", 500).then(
    () => false,
    () => true,
  );
  guest.socket.send(JSON.stringify({ type: "transpose", value: 5 }));
  assert(await blockedControl, "Convidado não autenticado conseguiu controlar o palco.");
  admin.socket.send(JSON.stringify({ type: "transpose", value: 2 }));
  await guestUpdate;
  guest.socket.close();
  admin.socket.close();
  console.log(
    "API/WS OK: rota /, registros/login, duas bandas, isolamento, papéis, sessão LIVE, convidado somente leitura e HOST autorizado.",
  );
} finally {
  try {
    if (userAId) await pool.query("DELETE FROM bands WHERE created_by=$1", [userAId]);
    if (userBId) await pool.query("DELETE FROM bands WHERE created_by=$1", [userBId]);
    if (userAId) await pool.query("DELETE FROM users WHERE id=$1", [userAId]);
    if (userBId) await pool.query("DELETE FROM users WHERE id=$1", [userBId]);
  } finally {
    await pool.end();
  }
}
