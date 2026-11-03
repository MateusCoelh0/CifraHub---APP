import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const baseUrl = "http://localhost:3000";

function getAllFiles(dir, extensions) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, extensions));
    } else {
      const ext = path.extname(fullPath).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log("=== INICIANDO TESTES DE VALIDAÇÃO GERAL DA ENTREGA ===");

  // 1. Verificação Estrita de ZERO Emojis no projeto com \\p{Extended_Pictographic}
  console.log("\n1. Verificando ausência total de emojis com \\p{Extended_Pictographic}...");
  const emojiPattern = /\p{Extended_Pictographic}/u;
  const filesToCheck = [
    ...getAllFiles("public", [".html", ".js", ".css"]),
    ...getAllFiles("src", [".ts", ".js"]),
  ];

  let emojiCount = 0;
  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, "utf-8");
    if (emojiPattern.test(content)) {
      console.error(`Erro: Emoji encontrado no arquivo ${file}`);
      emojiCount++;
    }
  }
  assert.equal(emojiCount, 0, "Nenhum emoji deve estar presente nos arquivos de código");
  console.log(`✓ ZERO emojis confirmados com \\p{Extended_Pictographic} em todos os ${filesToCheck.length} arquivos analisados!`);

  // 2. Testar Endpoint de Importação do Cifra Club
  console.log("\n2. Testando endpoint de importação do Cifra Club...");
  const invalidUrl = await request("/api/import-cifra", {
    method: "POST",
    body: { url: "https://google.com" },
  });
  assert.equal(invalidUrl.status, 400, "URL que não é do Cifra Club deve ser rejeitada");
  console.log("✓ Proteção SSRF e validação de domínio do Cifra Club validada");

  // 3. Testar Prevenção de Duplicatas e Idempotência
  console.log("\n3. Testando criação de música, idempotência e prevenção de duplicidade...");
  const stamp = Date.now();
  const reg = await request("/api/auth/register", {
    method: "POST",
    body: { name: `Lider Full`, email: `lider_full_${stamp}@cifrahub.app`, password: "StrongPassword123!" },
  });
  assert.equal(reg.status, 201);
  const token = reg.data.token;

  const band = await request("/api/bands", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { name: `Banda Full ${stamp}` },
  });
  assert.equal(band.status, 201);
  const bandId = band.data.data.id;

  // Criar música com ID de cliente gerado dinamicamente
  const clientSongId = crypto.randomUUID();
  const songData = {
    id: clientSongId,
    title: "A lua me traiu",
    artist: "Banda Calypso",
    key: "E",
    tempo: 120,
    cifra: "[Intro] [E] [A]\n[E]Parece até conto de fadas\n[A]Mas assim aconteceu",
  };

  const create1 = await request(`/api/bands/${bandId}/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: songData,
  });
  console.log("DEBUG create1:", create1.status, create1.data);
  assert.equal(create1.status, 201, "Música criada com sucesso");
  assert.equal(create1.data.data.id, clientSongId, "ID da música deve ser o ID do cliente");

  // Segunda chamada idêntica com o mesmo ID (simulando duplo clique ou reenvio)
  const create2 = await request(`/api/bands/${bandId}/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: songData,
  });
  console.log("DEBUG create2:", create2.status, create2.data);
  assert.equal(create2.status, 201, "Operação deve ser idempotente");
  assert.equal(create2.data.data.id, clientSongId, "Mesmo registro retornado");

  // Tentativa de criar música com mesmo título e artista sem ID (deve acusar duplicidade amigável)
  const duplicateAttempt = await request(`/api/bands/${bandId}/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      title: "a LUA me TRAIU ",
      artist: " banda calypso ",
      key: "E",
      tempo: 120,
      cifra: "teste",
    },
  });
  console.log("DEBUG duplicateAttempt:", duplicateAttempt.status, duplicateAttempt.data);
  assert.equal(duplicateAttempt.status, 409, "Tentativa de criar duplicata deve retornar 409");
  const errMsg = duplicateAttempt.data.error?.message || duplicateAttempt.data.error;
  assert.equal(errMsg, "Essa música já existe no seu repertório.");
  console.log("✓ Idempotência por ID e prevenção de duplicata com erro 409 amigável validadas!");

  // 4. Testar normalização automática no backend
  console.log("\n4. Testando normalização automática de cifra no backend...");
  const rawChordsSong = await request(`/api/bands/${bandId}/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      title: "Cifra com acordes em cima",
      artist: "Artista Teste",
      key: "C",
      tempo: 100,
      cifra: "C             G\nLinha com acorde em cima",
    },
  });
  assert.equal(rawChordsSong.status, 201);
  assert(rawChordsSong.data.data.cifra.includes("[C]"), "Backend deve normalizar cifra automaticamente");
  assert(rawChordsSong.data.data.cifra.includes("[G]"), "Backend deve normalizar acorde G");
  console.log("✓ Cifra normalizada automaticamente no backend para formato [C]Letra!");

  console.log("\n=== TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! 🎉 ===");
}

runTests().catch((err) => {
  console.error("Falha nos testes:", err);
  process.exit(1);
});
