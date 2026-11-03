/**
 * CifraHub - Utilitários de Normalização e Transposição no Navegador
 */
(() => {
  const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm"]);

  const NOTE_TO_SEMITONE = {
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

  const CHORD_REGEX =
    /^([A-G][#b]?)(m|min|maj|M|aug|dim|sus|add)?([0-9]{1,2})?(M)?([\+\-])?(\([^\)]+\)|°|º)?(\/[A-G][#b]?)?$/;

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

  function isChordToken(token) {
    if (!token) return false;
    const clean = token.trim().replace(/^[(\[]|[)\].,:;]$/g, "");
    return CHORD_REGEX.test(clean);
  }

  function isTablatureLine(line) {
    return /^\s*[eEaAdDgGbB1-6]\|[-0-9\/\\~hpb\s|]+/.test(line);
  }

  function isSectionMarker(line) {
    const trimmed = line.trim().toLowerCase();
    const inside = trimmed.replace(/^\[|\:?\]?$/g, "").trim();
    return SECTION_KEYWORDS.some((sec) => inside === sec);
  }

  function isChordLine(line) {
    const trimmed = line.trim();
    if (!trimmed || isTablatureLine(line) || isSectionMarker(line)) return false;
    if (trimmed.includes("[") && trimmed.includes("]")) return false;
    if (/[?!.,:;]{2,}/.test(trimmed)) return false;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;

    let chordCount = 0;
    for (const token of tokens) {
      if (isChordToken(token)) chordCount++;
    }

    return chordCount / tokens.length >= 0.7;
  }

  function transporNota(nota, semitons, preferFlat = false) {
    const clean = nota.trim();
    const currentSemitone = NOTE_TO_SEMITONE[clean];
    if (currentSemitone === undefined) return nota;

    const targetSemitone = (currentSemitone + semitons + 120) % 12;
    const scale = preferFlat ? NOTES_FLAT : NOTES_SHARP;
    return scale[targetSemitone];
  }

  function transporSemitons(acorde, semitons, targetKey) {
    if (!acorde || semitons === 0) return acorde;
    const trimmed = acorde.trim();

    if (isSectionMarker(trimmed)) return acorde;

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

  function transporLinhaAcordes(linha, semitons, targetKey) {
    if (semitons === 0 || !linha) return linha;
    var regex = /\S+/g;
    var match;
    var result = "";
    var lastIdx = 0;
    var drift = 0;

    while ((match = regex.exec(linha)) !== null) {
      var rawToken = match[0];
      var col = match.index;
      var spacesBefore = col - lastIdx;

      if (drift > 0) {
        var consume = Math.min(drift, Math.max(0, spacesBefore - 1));
        spacesBefore -= consume;
        drift -= consume;
      } else if (drift < 0) {
        var add = -drift;
        spacesBefore += add;
        drift += add;
      }

      result += " ".repeat(Math.max(0, spacesBefore));

      if (isChordToken(rawToken)) {
        var trans = transporSemitons(rawToken, semitons, targetKey);
        result += trans;
        drift += trans.length - rawToken.length;
      } else {
        result += rawToken;
      }

      lastIdx = col + rawToken.length;
    }

    if (lastIdx < linha.length) {
      var trailingSpaces = linha.length - lastIdx;
      if (drift > 0) {
        trailingSpaces = Math.max(0, trailingSpaces - drift);
      } else if (drift < 0) {
        trailingSpaces += -drift;
      }
      result += " ".repeat(Math.max(0, trailingSpaces));
    }

    return result;
  }

  function transporTextoCifra(textoCifra, semitons, targetKey) {
    if (!textoCifra || semitons === 0) return textoCifra;

    var lines = textoCifra.split("\n");
    var processed = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isTablatureLine(line)) {
        processed.push(line);
        continue;
      }

      if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
        var transposedLine = line.replace(/\[([^\]]+)\]/g, function (match, chord) {
          if (isSectionMarker(chord) || !isChordToken(chord.trim())) return match;
          var transposed = transporSemitons(chord.trim(), semitons, targetKey);
          return "[" + transposed + "]";
        });
        processed.push(transposedLine);
        continue;
      }

      var sectionMatch = line.trim().match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_:]+\])\s*(.+)$/);
      if (sectionMatch && !isChordToken(sectionMatch[1].replace(/[\[\]]/g, ""))) {
        var sec = sectionMatch[1];
        var chords = sectionMatch[2];
        var transposedChords = transporLinhaAcordes(chords, semitons, targetKey);
        processed.push(sec + " " + transposedChords);
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

  var transpor = transporTextoCifra;

  function descolarVersos(texto) {
    if (!texto) return "";
    var res = texto;
    res = res.replace(/(\[[^\]]+\])\s*(\[[A-G][#b]?[^\]]*\][A-Za-zÀ-ÿ])/g, "$1\n$2");
    res = res.replace(/([a-záéíóúâêôãõç!?.,;:])(\[[A-G][#b]?[^\]]*\][A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, "$1\n$2");
    res = res.replace(/([a-záéíóúâêôãõç!?.,;:])([A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, "$1\n$2");
    return res;
  }

  function chordProToTwoLines(texto) {
    if (!texto) return "";

    var res = descolarVersos(
      texto
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
    );

    var lines = res.split("\n");
    var outputLines = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        outputLines.push("");
        continue;
      }

      if (/^\[([A-Za-zÀ-ÿ0-9\s\-_:]+)\]$/.test(trimmed)) {
        outputLines.push(trimmed);
        continue;
      }

      var sectionWithChords = trimmed.match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_:]+\])\s*(.*)$/);
      if (sectionWithChords && !isChordToken(sectionWithChords[1].replace(/[\[\]]/g, ""))) {
        var secMarker = sectionWithChords[1];
        var rest = sectionWithChords[2].trim();
        if (!rest) {
          outputLines.push(secMarker);
        } else {
          var cleanChords = rest.replace(/\[([A-G][#b]?[^\]]*)\]/g, "$1").replace(/\s+/g, "  ");
          outputLines.push(secMarker + " " + cleanChords);
        }
        continue;
      }

      if (isTablatureLine(line)) {
        outputLines.push(line);
        continue;
      }

      if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
        var cleanLine = line.replace(/\[\s*\]/g, "");
        var withoutBrackets = cleanLine.replace(/\[[^\]]+\]/g, "");

        if (!withoutBrackets.trim()) {
          var chordOnly = cleanLine.replace(/\[([^\]]+)\]/g, "$1  ").replace(/\s+/g, "  ").trim();
          outputLines.push(chordOnly);
          continue;
        }

        var chordLine = "";
        var lyricLine = "";
        var regex = /\[([^\]]+)\]|([^\[]+)/g;
        var match;

        while ((match = regex.exec(cleanLine)) !== null) {
          if (match[1]) {
            var chord = match[1].trim();
            if (!chord) continue;
            var targetCol = lyricLine.length;

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

  function normalizarCifra(textoBruto) {
    if (!textoBruto) return "";

    var cleaned = textoBruto
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    var lines = cleaned.split("\n");
    var filteredLines = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (
        trimmed.indexOf("Tom:") === 0 ||
        trimmed.indexOf("Capotraste:") === 0 ||
        trimmed.indexOf("Dificuldade:") === 0 ||
        trimmed.indexOf("Afinação:") === 0 ||
        trimmed.indexOf("Composição de:") === 0 ||
        trimmed.indexOf("Essa informação está errada?") !== -1 ||
        trimmed.indexOf("Aprenda a tocar a cifra de") !== -1 ||
        trimmed.indexOf("Aplicativos do Cifra Club") !== -1 ||
        trimmed.indexOf("Mais acessadas") !== -1
      ) {
        continue;
      }

      var sectionSplit = trimmed.match(/^(\[\s*(?:Intro|Primeira Parte|Segunda Parte|Terceira Parte|Quarta Parte|Pré-Refrão|Pre-Refrao|Refrão|Refrao|Coro|Ponte|Solo|Interlúdio|Interludio|Passagem|Final|Outro|Verso|Estrofe)[^\]]*\]|\b(?:Intro|Primeira Parte|Segunda Parte|Refrão|Refrao|Solo|Ponte|Interlúdio|Interludio)\b:?)\s*(.+)$/i);
      if (sectionSplit) {
        filteredLines.push(sectionSplit[1].trim());
        filteredLines.push(sectionSplit[2].trim());
        continue;
      }

      filteredLines.push(line);
    }

    var hasInlineChords = filteredLines.some(function(l) { return /\[[A-G][#b]?[^\]]*\]/.test(l); });
    var hasChordLines = filteredLines.some(function(l) { return isChordLine(l); });

    if (hasInlineChords && !hasChordLines) {
      return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    var outputLines = [];
    var idx = 0;

    while (idx < filteredLines.length) {
      var currentLine = filteredLines[idx];
      var currentTrimmed = currentLine.trim();

      if (!currentTrimmed) {
        outputLines.push("");
        idx++;
        continue;
      }

      if (isTablatureLine(currentLine)) {
        outputLines.push(currentLine);
        idx++;
        continue;
      }

      if (isSectionMarker(currentLine)) {
        var secName = currentTrimmed.replace(/^\[|\:?\]?$/g, "").trim();
        var formattedSec = secName.charAt(0).toUpperCase() + secName.slice(1);
        outputLines.push("[" + formattedSec + "]");
        idx++;
        continue;
      }

      if (isChordLine(currentLine)) {
        var chordsWithPositions = [];
        var regex = /\S+/g;
        var match;
        while ((match = regex.exec(currentLine)) !== null) {
          chordsWithPositions.push({ chord: match[0], index: match.index });
        }

        var nextLine = idx + 1 < filteredLines.length ? filteredLines[idx + 1] : "";
        var nextTrimmed = nextLine.trim();

        var nextIsChord = isChordLine(nextLine);
        var nextIsTab = isTablatureLine(nextLine);
        var nextIsSection = isSectionMarker(nextLine);
        var nextIsEmpty = !nextTrimmed;

        if (nextIsEmpty || nextIsChord || nextIsTab || nextIsSection) {
          var chordOnlyLine = chordsWithPositions.map(function(c) { return "[" + c.chord + "]"; }).join(" ");
          outputLines.push(chordOnlyLine);
          idx++;
        } else {
          var lyricChars = nextLine.split("");
          for (var j = chordsWithPositions.length - 1; j >= 0; j--) {
            var item = chordsWithPositions[j];
            while (lyricChars.length < item.index) {
              lyricChars.push(" ");
            }
            lyricChars.splice(item.index, 0, "[" + item.chord + "]");
          }
          outputLines.push(lyricChars.join(""));
          idx += 2;
        }
      } else {
        outputLines.push(currentLine);
        idx++;
      }
    }

    return outputLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  window.normalizarCifra = normalizarCifra;
  window.transporSemitons = transporSemitons;
  window.transporTextoCifra = transporTextoCifra;
  window.transporLinhaAcordes = transporLinhaAcordes;
  window.transpor = transpor;
  window.descolarVersos = descolarVersos;
  window.chordProToTwoLines = chordProToTwoLines;
  window.isChordToken = isChordToken;
  window.isChordLine = isChordLine;
  window.isTablatureLine = isTablatureLine;
  window.isSectionMarker = isSectionMarker;
})();
