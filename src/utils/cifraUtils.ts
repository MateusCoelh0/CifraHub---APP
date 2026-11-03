import http2 from "node:http2";
/**
 * Utilitários para normalização, importação e transposição de cifras musicais.
 */

// Escala cromática com sustenidos e bemóis
const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Tonalidades que tradicionalmente utilizam bemóis
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm"]);

/** Mapeamento de normalização de notas equivalentes para índice cromático 0..11 */
const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

// Regex rigorosa para acordes individuais comuns em cifras brasileiras
// Ex: C, C#m, Bb7(9), G/B, Dsus4, F#m7(b5), A°, C7M, Em/G, etc.
const CHORD_REGEX =
  /^([A-G][#b]?)(m|min|maj|M|aug|dim|sus|add)?([0-9]{1,2})?(M)?([\+\-])?(\([^\)]+\)|°|º)?(\/[A-G][#b]?)?$/;

// Seções conhecidas
const SECTION_KEYWORDS = [
  "intro",
  "primeira parte",
  "segunda parte",
  "terceira parte",
  "quarta parte",
  "pré-refrão",
  "pre-refrao",
  "refrão",
  "refrao",
  "coro",
  "ponte",
  "solo",
  "interlúdio",
  "interludio",
  "passagem",
  "final",
  "outro",
  "verso",
  "estrofe",
];

export function isChordToken(token: string): boolean {
  if (!token) return false;
  const clean = token.trim();
  // Ignorar pontuação colada se houver
  const noPunct = clean.replace(/^[(\[]|[)\].,:;]$/g, "");
  return CHORD_REGEX.test(noPunct);
}

export function isTablatureLine(line: string): boolean {
  return /^\s*[eEaAdDgGbB1-6]\|[-0-9\/\\~hpb\s|]+/.test(line);
}

export function isSectionMarker(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  const inside = trimmed.replace(/^\[|\:?\]?$/g, "").trim();
  // Só é marcador puro se a linha for curta e não contiver acordes múltiplos
  return SECTION_KEYWORDS.some((sec) => inside === sec);
}

export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isTablatureLine(line) || isSectionMarker(line)) return false;

  // Se a linha já tiver formato inline [C], não é uma linha exclusiva de acordes no formato antigo
  if (trimmed.includes("[") && trimmed.includes("]")) return false;

  // Se tiver caracteres como ?, !, @, etc, geralmente é letra
  if (/[?!.,:;]{2,}/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let chordCount = 0;
  for (const token of tokens) {
    if (isChordToken(token)) {
      chordCount++;
    }
  }

  // Se pelo menos 70% dos tokens forem acordes (ou se tiver só 1 token e ele for acorde)
  return chordCount / tokens.length >= 0.7;
}

/**
 * Transpõe uma nota base (ex: C, F#, Bb) por N semitons.
 */
export function transporNota(nota: string, semitons: number, preferFlat = false): string {
  const clean = nota.trim();
  const currentSemitone = NOTE_TO_SEMITONE[clean];
  if (currentSemitone === undefined) return nota;

  const targetSemitone = (currentSemitone + semitons + 120) % 12;
  const scale = preferFlat ? NOTES_FLAT : NOTES_SHARP;
  return scale[targetSemitone];
}

/**
 * Transpõe um acorde completo (incluindo baixo invertido / e extensões).
 * Ex: G/B + 2 => A/C#
 *     Bb + 2 => C
 *     F#m7 + 3 => Am7
 */
export function transporSemitons(acorde: string, semitons: number, targetKey?: string): string {
  if (!acorde || semitons === 0) return acorde;
  const trimmed = acorde.trim();

  // Se for seção (ex: [Refrão], [Intro]), não transpor
  if (isSectionMarker(trimmed)) return acorde;

  // Separar acorde principal e baixo invertido se houver (ex: G/B)
  const slashIdx = trimmed.indexOf("/");
  let mainChord = trimmed;
  let bassNote = "";

  if (slashIdx !== -1) {
    mainChord = trimmed.substring(0, slashIdx);
    bassNote = trimmed.substring(slashIdx + 1);
  }

  const match = mainChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return acorde;

  const [, rootNote, suffix] = match;
  const preferFlat = targetKey ? FLAT_KEYS.has(targetKey) : semitons < 0;

  const newRoot = transporNota(rootNote, semitons, preferFlat);
  let newBass = "";
  if (bassNote) {
    newBass = "/" + transporNota(bassNote, semitons, preferFlat);
  }

  return `${newRoot}${suffix}${newBass}`;
}

/**
 * Transpõe uma linha pura de acordes preservando a coluna dos acordes seguintes
 * ao compensar a diferença de largura (crescimento ou encolhimento).
 */
export function transporLinhaAcordes(linha: string, semitons: number, targetKey?: string): string {
  if (semitons === 0 || !linha) return linha;
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let result = "";
  let lastIdx = 0;
  let drift = 0;

  while ((match = regex.exec(linha)) !== null) {
    const rawToken = match[0];
    const col = match.index;
    let spacesBefore = col - lastIdx;

    if (drift > 0) {
      const consume = Math.min(drift, Math.max(0, spacesBefore - 1));
      spacesBefore -= consume;
      drift -= consume;
    } else if (drift < 0) {
      const add = -drift;
      spacesBefore += add;
      drift += add;
    }

    result += " ".repeat(Math.max(0, spacesBefore));

    if (isChordToken(rawToken)) {
      const trans = transporSemitons(rawToken, semitons, targetKey);
      result += trans;
      drift += trans.length - rawToken.length;
    } else {
      result += rawToken;
    }

    lastIdx = col + rawToken.length;
  }

  if (lastIdx < linha.length) {
    let trailingSpaces = linha.length - lastIdx;
    if (drift > 0) {
      trailingSpaces = Math.max(0, trailingSpaces - drift);
    } else if (drift < 0) {
      trailingSpaces += -drift;
    }
    result += " ".repeat(Math.max(0, trailingSpaces));
  }

  return result;
}

/**
 * Transpõe um texto de cifra completo, suportando tanto formato com colchetes [Am7]
 * quanto linhas tradicionais de acordes sobre letra (Cifra Club).
 */
export function transporTextoCifra(textoCifra: string, semitons: number, targetKey?: string): string {
  if (!textoCifra || semitons === 0) return textoCifra;

  const lines = textoCifra.split("\n");
  const processed: string[] = [];

  for (const line of lines) {
    if (isTablatureLine(line)) {
      processed.push(line);
      continue;
    }

    if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
      const transposedLine = line.replace(/\[([^\]]+)\]/g, (match, chord) => {
        if (isSectionMarker(chord) || !isChordToken(chord.trim())) return match;
        const transposed = transporSemitons(chord.trim(), semitons, targetKey);
        return `[${transposed}]`;
      });
      processed.push(transposedLine);
      continue;
    }

    const sectionMatch = line.trim().match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_:]+\])\s*(.+)$/);
    if (sectionMatch && !isChordToken(sectionMatch[1].replace(/[\[\]]/g, ""))) {
      const sec = sectionMatch[1];
      const chords = sectionMatch[2];
      const transposedChords = transporLinhaAcordes(chords, semitons, targetKey);
      processed.push(`${sec} ${transposedChords}`);
      continue;
    }

    if (isChordLine(line)) {
      processed.push(transporLinhaAcordes(line, semitons, targetKey));
      continue;
    }

    processed.push(line);
  }

  return processed.join("\n");
}

export const transpor = transporTextoCifra;

/**
 * Descola versos que porventura tenham colado sem quebra de linha.
 */
export function descolarVersos(texto: string): string {
  if (!texto) return "";
  let res = texto;
  // 1. [Intro] ou seção seguido de acorde e letra: [Intro] [C][G]Atirei -> [Intro] [C]\n[G]Atirei
  res = res.replace(/(\[[^\]]+\])\s*(\[[A-G][#b]?[^\]]*\][A-Za-zÀ-ÿ])/g, "$1\n$2");
  // 2. Letra minúscula ou pontuação colada em [Acorde]LetraMaiúscula: gato to[Dm]Mas -> gato to\n[Dm]Mas
  res = res.replace(/([a-záéíóúâêôãõç!?.,;:])(\[[A-G][#b]?[^\]]*\][A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, "$1\n$2");
  // 3. Letra minúscula ou pontuação colada diretamente em Letra Maiúscula: gato toMas -> gato to\nMas
  res = res.replace(/([a-záéíóúâêôãõç!?.,;:])([A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, "$1\n$2");
  return res;
}

/**
 * Converte cifras ChordPro inline ([C]Letra) em 2 linhas (acordes sobre letra)
 * no estilo Cifra Club, preservando espaços, seções e tablaturas.
 */
export function chordProToTwoLines(texto: string): string {
  if (!texto) return "";

  let res = descolarVersos(
    texto
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
  );

  const lines = res.split("\n");
  const outputLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      outputLines.push("");
      continue;
    }

    if (/^\[([A-Za-zÀ-ÿ0-9\s\-_:]+)\]$/.test(trimmed)) {
      outputLines.push(trimmed);
      continue;
    }

    const sectionWithChords = trimmed.match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_:]+\])\s*(.*)$/);
    if (sectionWithChords && !isChordToken(sectionWithChords[1].replace(/[\[\]]/g, ""))) {
      const secMarker = sectionWithChords[1];
      const rest = sectionWithChords[2].trim();
      if (!rest) {
        outputLines.push(secMarker);
      } else {
        const cleanChords = rest.replace(/\[([A-G][#b]?[^\]]*)\]/g, "$1").replace(/\s+/g, "  ");
        outputLines.push(secMarker + " " + cleanChords);
      }
      continue;
    }

    if (isTablatureLine(line)) {
      outputLines.push(line);
      continue;
    }

    if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
      const cleanLine = line.replace(/\[\s*\]/g, "");
      const withoutBrackets = cleanLine.replace(/\[[^\]]+\]/g, "");

      if (!withoutBrackets.trim()) {
        const chordOnly = cleanLine.replace(/\[([^\]]+)\]/g, "$1  ").replace(/\s+/g, "  ").trim();
        outputLines.push(chordOnly);
        continue;
      }

      let chordLine = "";
      let lyricLine = "";
      const regex = /\[([^\]]+)\]|([^\[]+)/g;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(cleanLine)) !== null) {
        if (match[1]) {
          const chord = match[1].trim();
          if (!chord) continue;
          const targetCol = lyricLine.length;

          if (chordLine.length < targetCol) {
            chordLine += " ".repeat(targetCol - chordLine.length);
          } else if (chordLine.length > targetCol) {
            chordLine += " ";
            while (lyricLine.length < chordLine.length - chord.length) {
              lyricLine += " ";
            }
          }
          chordLine += chord;
        } else if (match[2]) {
          lyricLine += match[2];
        }
      }

      if (chordLine.trim()) {
        outputLines.push(chordLine);
      }
      if (lyricLine.trim()) {
        outputLines.push(lyricLine);
      }
      continue;
    }

    outputLines.push(line);
  }

  return outputLines.join("\n");
}

/**
 * Normaliza qualquer cifra para o formato padrão do CifraHub:
 * - Se já estiver em formato inline [Acorde]Letra, normaliza quebras e espaços.
 * - Se estiver no formato clássico do Cifra Club (linha de acordes em cima, letra embaixo),
 *   converte com precisão posicional de colunas para [Acorde]Letra.
 * - Preserva tablaturas intactas.
 * - Limpa ruídos de propaganda e cabeçalhos desnecessários.
 */
export function normalizarCifra(textoBruto: string): string {
  if (!textoBruto) return "";

  // 1. Limpeza de caracteres invisíveis e padronização de quebras de linha
  const cleaned = textoBruto
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = cleaned.split("\n");
  const filteredLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // Remover ruídos do Cifra Club
    if (
      trimmed.startsWith("Tom:") ||
      trimmed.startsWith("Capotraste:") ||
      trimmed.startsWith("Dificuldade:") ||
      trimmed.startsWith("Afinação:") ||
      trimmed.startsWith("Composição de:") ||
      trimmed.includes("Essa informação está errada?") ||
      trimmed.includes("Aprenda a tocar a cifra de") ||
      trimmed.includes("Aplicativos do Cifra Club") ||
      trimmed.includes("Mais acessadas")
    ) {
      continue;
    }

    // Separar marcador de seção de acordes na mesma linha (ex: [Intro] Em7 A D G)
    const sectionSplit = trimmed.match(/^(\[\s*(?:Intro|Primeira Parte|Segunda Parte|Terceira Parte|Quarta Parte|Pré-Refrão|Pre-Refrao|Refrão|Refrao|Coro|Ponte|Solo|Interlúdio|Interludio|Passagem|Final|Outro|Verso|Estrofe)[^\]]*\]|\b(?:Intro|Primeira Parte|Segunda Parte|Refrão|Refrao|Solo|Ponte|Interlúdio|Interludio)\b:?)\s*(.+)$/i);
    if (sectionSplit) {
      filteredLines.push(sectionSplit[1].trim());
      filteredLines.push(sectionSplit[2].trim());
      continue;
    }

    filteredLines.push(line);
  }

  // 2. Verificar se já é formato inline predominante
  const hasInlineChords = filteredLines.some((l) => /\[[A-G][#b]?[^\]]*\]/.test(l));
  const hasChordLines = filteredLines.some((l) => isChordLine(l));

  if (hasInlineChords && !hasChordLines) {
    return filteredLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // 3. Converter linhas de acordes + letra em formato inline [Acorde]Letra
  const outputLines: string[] = [];
  let i = 0;

  while (i < filteredLines.length) {
    const currentLine = filteredLines[i];
    const trimmed = currentLine.trim();

    if (!trimmed) {
      outputLines.push("");
      i++;
      continue;
    }

    if (isTablatureLine(currentLine)) {
      outputLines.push(currentLine);
      i++;
      continue;
    }

    if (isSectionMarker(currentLine)) {
      const secName = trimmed.replace(/^\[|\:?\]?$/g, "").trim();
      const formattedSec = secName.charAt(0).toUpperCase() + secName.slice(1);
      outputLines.push(`[${formattedSec}]`);
      i++;
      continue;
    }

    if (isChordLine(currentLine)) {
      const chordsWithPositions: { chord: string; index: number }[] = [];
      const regex = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(currentLine)) !== null) {
        chordsWithPositions.push({
          chord: match[0],
          index: match.index,
        });
      }

      const nextLine = i + 1 < filteredLines.length ? filteredLines[i + 1] : "";
      const nextTrimmed = nextLine.trim();

      const nextIsChord = isChordLine(nextLine);
      const nextIsTab = isTablatureLine(nextLine);
      const nextIsSection = isSectionMarker(nextLine);
      const nextIsEmpty = !nextTrimmed;

      if (nextIsEmpty || nextIsChord || nextIsTab || nextIsSection) {
        const chordOnlyLine = chordsWithPositions.map((c) => `[${c.chord}]`).join(" ");
        outputLines.push(chordOnlyLine);
        i++;
      } else {
        let lyricChars = nextLine.split("");
        for (let j = chordsWithPositions.length - 1; j >= 0; j--) {
          const { chord, index } = chordsWithPositions[j];
          while (lyricChars.length < index) {
            lyricChars.push(" ");
          }
          lyricChars.splice(index, 0, `[${chord}]`);
        }
        outputLines.push(lyricChars.join(""));
        i += 2;
      }
    } else {
      outputLines.push(currentLine);
      i++;
    }
  }

  return outputLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchCifraClubHtml(targetUrl: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) {
    throw new Error("Muitos redirecionamentos ao acessar o Cifra Club.");
  }
  const parsed = new URL(targetUrl);
  return new Promise<string>((resolve, reject) => {
    let client: http2.ClientHttp2Session | null = null;
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        try {
          client?.destroy();
        } catch {}
        reject(new Error("Tempo limite esgotado ao acessar o Cifra Club. Tente colar a cifra manualmente."));
      }
    }, 9000);

    try {
      client = http2.connect(`https://${parsed.hostname}`);
    } catch (err: any) {
      clearTimeout(timeout);
      return reject(new Error(`Falha ao conectar com o Cifra Club: ${err.message}`));
    }

    client.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        try {
          client?.destroy();
        } catch {}
        reject(err);
      }
    });

    const path = parsed.pathname + (parsed.search || "");
    const req = client.request({
      [http2.constants.HTTP2_HEADER_METHOD]: "GET",
      [http2.constants.HTTP2_HEADER_PATH]: path,
      [http2.constants.HTTP2_HEADER_AUTHORITY]: parsed.hostname,
      [http2.constants.HTTP2_HEADER_SCHEME]: "https",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    });

    let statusCode = 200;
    let locationHeader: string | undefined;
    req.on("response", (headers) => {
      const status = headers[http2.constants.HTTP2_HEADER_STATUS];
      statusCode = typeof status === "number" ? status : parseInt(String(status), 10) || 200;
      const loc = headers.location;
      if (loc) {
        locationHeader = Array.isArray(loc) ? loc[0] : loc;
      }
    });

    let data = "";
    req.on("data", (chunk: Buffer | string) => {
      data += chunk;
    });

    req.on("end", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        try {
          client?.close();
        } catch {}

        if ((statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) && locationHeader) {
          const redirectUrl = new URL(locationHeader, targetUrl).toString();
          return resolve(fetchCifraClubHtml(redirectUrl, redirectCount + 1));
        }

        if (statusCode >= 400) {
          reject(new Error(`O Cifra Club retornou status ${statusCode}. Verifique se a música existe.`));
        } else {
          resolve(data);
        }
      }
    });

    req.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        try {
          client?.destroy();
        } catch {}
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Importa e extrai cifra do Cifra Club a partir de uma URL.
 */
export async function extrairCifraClub(urlStr: string): Promise<{
  title: string;
  artist: string;
  key: string;
  tempo: number;
  cifra: string;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw new Error("URL inválida. Forneça um link completo iniciado por https://");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Protocolo inválido. Apenas links HTTP e HTTPS são permitidos.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname !== "cifraclub.com.br" &&
    !hostname.endsWith(".cifraclub.com.br") &&
    hostname !== "cifraclub.com" &&
    !hostname.endsWith(".cifraclub.com")
  ) {
    throw new Error("O link fornecido não pertence ao Cifra Club (cifraclub.com.br).");
  }

  let html: string;
  try {
    html = await fetchCifraClubHtml(parsedUrl.toString());
  } catch (err: any) {
    // Fallback secundário usando fetch comum caso HTTP/2 falhe
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`O Cifra Club retornou status ${res.status}.`);
      }
      html = await res.text();
    } catch {
      throw err;
    }
  }

  // Extrair título
  let title = "";
  const titleMatch =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = cleanHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "")).trim();
    // Limpar sufixos comuns em <title>
    title = title.replace(/\s*-\s*Cifra Club.*$/i, "").replace(/\s*\|\s*Cifra Club.*$/i, "");
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      title = parts[0].trim();
    }
  }

  // Extrair artista
  let artist = "";
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    const parts = ogTitleMatch[1].split(" - ");
    if (parts.length > 1) {
      artist = cleanHtmlEntities(parts[1].split("|")[0].replace(/Cifra Club/i, "")).trim();
    }
  }
  if (!artist) {
    const artistMatch =
      html.match(/<h2[^>]*class=["'][^"']*(?:t-artist|c-artist|artist)[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) ||
      html.match(/<a[^>]*class=["'][^"']*(?:t-artist|c-artist|artist)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (artistMatch) {
      artist = cleanHtmlEntities(artistMatch[1].replace(/<[^>]+>/g, "")).trim();
    }
  }

  // Extrair tom
  let key = "C";
  const keyMatch =
    html.match(/Tom\s*=\s*([A-G][#b]?m?)/i) ||
    html.match(/id=["']cifra_tom["'][^>]*>[\s\S]*?<a[^>]*>([A-G][#b]?m?)<\/a>/i) ||
    html.match(/id=["']cifra_tom["'][^>]*>([^<]+)</i) ||
    html.match(/data-key=["']([A-G][#b]?m?)["']/i) ||
    html.match(/Tom:\s*<b>([A-G][#b]?m?)<\/b>/i) ||
    html.match(/Tom:\s*([A-G][#b]?m?)/i);
  if (keyMatch) {
    key = keyMatch[1].trim();
  }

  // Extrair conteúdo da cifra (<pre>)
  let rawCifra = "";
  const preMatch =
    html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) ||
    html.match(/<div[^>]*class=["'][^"']*cifra_cnt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (preMatch) {
    let preContent = preMatch[1];
    // Converter divs, ps e brs do Cifra Club em quebras de linha reais
    preContent = preContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<div[^>]*>/gi, "")
      .replace(/<p[^>]*>/gi, "");
    // Decodificar entidades e remover tags HTML preservando texto e quebras
    rawCifra = cleanHtmlEntities(preContent.replace(/<[^>]+>/g, ""));
    // Limpar zero-width spaces e artefatos de formatação do Cifra Club
    rawCifra = rawCifra.replace(/[\u200B-\u200D\uFEFF]/g, "");
    rawCifra = rawCifra.replace(/^[ \t]*Tom\s*=\s*[^\r\n]*[\r\n]*/gim, "");
    rawCifra = descolarVersos(rawCifra);
    rawCifra = rawCifra.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    rawCifra = rawCifra.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (!rawCifra.trim()) {
    throw new Error(
      "Não foi possível extrair a cifra desta página do Cifra Club. Você pode colar a cifra manualmente no campo abaixo.",
    );
  }

  return {
    title: title || "Música sem título",
    artist: artist || "Artista desconhecido",
    key: key || "C",
    tempo: 120,
    cifra: rawCifra,
  };
}

function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#([0-9]{1,5});/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}
