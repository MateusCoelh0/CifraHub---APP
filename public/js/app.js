// ═══════════════════════════ CONFIGURAÇÕES GLOBAIS ═══════════════════════════
const CONFIG = {
  NOTES: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  NOTES_FLAT: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
};

// ═══════════════════════════ ESTADO DA APLICAÇÃO ═══════════════════════════
let appState = {
  ws: null,
  wsController: null,
  clientId: null,
  isHost: false,
  currentSong: null,
  currentSongIndex: null,
  currentSetlist: null,
  editingSetlist: null,
  viewingSetlistId: null,
  transpose: 0,
  capotraste: 0,
  autoScrollSpeed: 0,
  isAutoScrolling: false,
  scrollPosition: 0,
  stageMode: false,
  viewerMode: false,
  singerMode: false,
  fontSize: 16,
  singerFontSize: 28,
  theme: "light",
  songs: [],
  setlists: [],
  clientsCount: 0,
  deviceName: "CifraHub Device",
  lastPingTime: Date.now(),
};

let autoScrollInterval = null;

// ═══════════════════════════ INICIALIZAR ═══════════════════════════
function init() {
  loadLocalData();
  renderSongs();
  renderSetlists();
  if (appState.viewerMode) {
    document.getElementById("container").classList.add("viewer-mode");
  }
  updateUI();
  updateConnectionStatus("Aguardando sessão", "var(--text-muted)");
  setupEventListeners();
  window.CifraHubTouch.setup();
  void window.CifraHubAuth.initialize();
}

function setupEventListeners() {
  window.addEventListener("beforeunload", () => {
    if (appState.wsController) appState.wsController.stop();
  });
  document.getElementById("searchInput")?.addEventListener("input", renderSongs);
  const stageScroller = document.getElementById("cifraContainer");
  let lastSentScroll = -1;
  let lastScrollSentAt = 0;
  stageScroller?.addEventListener(
    "scroll",
    () => {
      const now = Date.now();
      if (!appState.isHost || now - lastScrollSentAt < 100) return;
      const position = stageScroller.scrollTop;
      if (Math.abs(position - lastSentScroll) < 2) return;
      lastScrollSentAt = now;
      lastSentScroll = position;
      sendMessage({ type: "scroll", position });
    },
    { passive: true },
  );
}

// ═══════════════════════════ WEBSOCKET ═══════════════════════════
function connectWebSocket() {
  const connection = window.CifraHubContext.connection;
  if (!connection) return;
  if (appState.wsController) appState.wsController.stop();
  try {
    appState.wsController = window.CifraHubWebSocket.connect(connection, {
      onSocket: (socket) => {
        appState.ws = socket;
      },
      onOpen: (socket) => {
        console.log("✅ Conectado ao servidor");
        updateConnectionStatus("Conectado", "var(--success)");
        socket.send(JSON.stringify({ type: "setDeviceName", name: appState.deviceName }));
        socket.send(JSON.stringify({ type: "requestState" }));
      },
      onMessage: (raw) => {
        try {
          handleMessage(JSON.parse(raw));
        } catch (error) {
          console.error("Mensagem WebSocket inválida:", error);
        }
      },
      onError: (error) => {
        console.error("❌ Erro WebSocket:", error);
        updateConnectionStatus("Erro", "var(--danger)");
      },
      onClose: (event) => {
        console.log("🔌 Desconectado");
        updateConnectionStatus("Desconectado", "#ff8800");
        if (event?.code === 1008) showToast("Código inválido ou sessão encerrada.");
      },
    });
  } catch (err) {
    console.error("Erro ao conectar:", err);
    updateConnectionStatus("Erro", "var(--danger)");
  }
}

function disconnectWebSocket() {
  if (appState.wsController) appState.wsController.stop();
  appState.wsController = null;
  appState.ws = null;
}

function handleMessage(message) {
  switch (message.type) {
    case "init":
      appState.clientId = message.clientId;
      appState.isHost = message.isHost;
      if (message.isHost && message.hostToken) {
        const connection = window.CifraHubContext.connection ?? {};
        const roomKey = connection.sessionId ?? connection.code ?? "default";
        localStorage.setItem(`cifrahub_hostToken_${roomKey}`, message.hostToken);
      }
      appState.songs = message.state.songs;
      appState.setlists = message.state.setlists;
      appState.clientsCount = message.clientsCount;
      syncState(message.state);
      renderSongs();
      renderSetlists();
      updateUI();
      showToast(`${message.isHost ? "🎸 Você é o Líder de Louvor" : "👁️ Você é um Visualizador"}`);
      break;

    case "stateSync":
      syncState(message.state);
      appState.clientsCount = message.clientsCount;
      updateUI();
      break;

    case "clientsUpdate":
      appState.clientsCount = message.clientsCount;
      updateUI();
      break;

    case "newHost":
      if (message.clientId === appState.clientId) {
        appState.isHost = true;
        if (message.hostToken) {
          const connection = window.CifraHubContext.connection ?? {};
          const roomKey = connection.sessionId ?? connection.code ?? "default";
          localStorage.setItem(`cifrahub_hostToken_${roomKey}`, message.hostToken);
        }
        updateUI();
        showToast("🎸 Você é o novo Líder de Louvor!");
      }
      break;

    case "songSelected":
      appState.currentSong = message.song;
      appState.currentSongIndex = message.index;
      appState.transpose = 0;
      appState.capotraste = 0;
      document.getElementById("transposeSlider").value = 0;
      document.getElementById("capoSlider").value = 0;
      appState.scrollPosition = 0;
      appState.isAutoScrolling = false;
      updateUI();
      renderCifra();
      break;

    case "setlistSelected":
      appState.currentSetlist = message.setlist;
      appState.currentSong = message.song ?? null;
      appState.currentSongIndex = message.index ?? 0;
      appState.transpose = 0;
      appState.capotraste = 0;
      document.getElementById("transposeSlider").value = 0;
      document.getElementById("capoSlider").value = 0;
      appState.scrollPosition = 0;
      updateUI();
      renderCifra();
      break;

    case "transposeUpdated":
      appState.transpose = message.transpose;
      document.getElementById("transposeSlider").value = message.transpose;
      updateUI();
      renderCifra();
      break;

    case "capotrasteUpdated":
      appState.capotraste = message.capotraste;
      document.getElementById("capoSlider").value = message.capotraste;
      updateUI();
      renderCifra();
      break;

    case "autoScrollUpdated":
      appState.autoScrollSpeed = message.speed;
      appState.isAutoScrolling = message.isActive;
      document.getElementById("scrollSlider").value = message.speed;
      updateUI();
      startAutoScroll();
      break;

    case "stageModeUpdated":
      appState.stageMode = message.enabled;
      updateUI();
      break;

    case "scrollUpdated": {
      const container = document.getElementById("cifraContainer");
      if (container) container.scrollTop = message.position;
      appState.scrollPosition = message.position;
      break;
    }

    case "songAdded":
      appState.songs.push(message.song);
      renderSongs();
      saveLocalData();
      showToast("✅ Música adicionada");
      break;

    case "songUpdated":
      const idx = appState.songs.findIndex((s) => s.id === message.song.id);
      if (idx !== -1) {
        appState.songs[idx] = message.song;
        if (appState.currentSong && appState.currentSong.id === message.song.id) {
          appState.currentSong = message.song;
          renderCifra();
        }
        renderSongs();
        saveLocalData();
      }
      showToast("✅ Música atualizada");
      break;

    case "setlistCreated":
      appState.setlists.push(message.setlist);
      renderSetlists();
      saveLocalData();
      showToast("✅ Setlist criada");
      break;

    case "setlistUpdated":
      const sidx = appState.setlists.findIndex((s) => s.id === message.setlist.id);
      if (sidx !== -1) {
        appState.setlists[sidx] = message.setlist;
        renderSetlists();
        saveLocalData();
      }
      break;

    case "setlistDeleted":
      appState.setlists = appState.setlists.filter((s) => s.id !== message.id);
      if (appState.viewingSetlistId === message.id) {
        appState.viewingSetlistId = null;
      }
      renderSetlists();
      renderSongs();
      saveLocalData();
      showToast("✅ Setlist removida");
      break;

    case "songDeleted":
      appState.songs = appState.songs.filter((s) => s.id !== message.id);
      if (message.setlists) appState.setlists = message.setlists;
      if (appState.currentSong && appState.currentSong.id === message.id) {
        appState.currentSong = null;
        appState.currentSongIndex = null;
      }
      renderSongs();
      renderSetlists();
      updateUI();
      saveLocalData();
      showToast("🗑️ Música removida");
      break;

    case "operationError":
      showToast(message.message || "Não foi possível concluir a alteração.");
      break;
  }
}

function sendMessage(message) {
  if (appState.ws && appState.ws.readyState === 1) {
    appState.ws.send(JSON.stringify(message));
    return true;
  }
  showToast("Sem conexão com a sessão. Reconecte antes de alterar o repertório.");
  return false;
}

// ═══════════════════════════ SINCRONIZAÇÃO ═══════════════════════════
function syncState(state) {
  appState.currentSong = state.currentSong;
  appState.currentSongIndex = state.currentSongIndex;
  appState.currentSetlist = state.currentSetlist;
  appState.transpose = state.transpose;
  appState.capotraste = state.capotraste;
  appState.autoScrollSpeed = state.autoScrollSpeed;
  appState.isAutoScrolling = state.isAutoScrolling;
  appState.scrollPosition = state.scrollPosition;
  appState.stageMode = state.stageMode;
}

function canEditLibrary() {
  const role = window.CifraHubContext.activeBand?.role;
  return role === "ADMIN" || role === "MEMBER";
}

function activeBandId() {
  return window.CifraHubContext.activeBand?.id;
}

// ═══════════════════════════ CONTROLES DO HOST ═══════════════════════════
function selectSong(index) {
  if (!appState.isHost) return;
  const song = appState.songs[index];
  sendMessage({
    type: "selectSong",
    song: song,
    index: index,
  });
}

function selectSetlist(id) {
  const setlist = appState.setlists.find((s) => s.id === id);
  if (!setlist) return;

  appState.viewingSetlistId = id;
  renderSongs();
  renderSetlists();
  updateSongsHeader();

  if (appState.isHost) {
    appState.currentSetlist = setlist;
    appState.currentSongIndex = 0;
    appState.currentSong = appState.songs.find((song) => song.id === setlist.songs[0]) ?? null;
    appState.transpose = 0;
    appState.capotraste = 0;
    appState.scrollPosition = 0;
    appState.isAutoScrolling = false;
    appState.autoScrollSpeed = 0;
    document.getElementById("cifraContainer").scrollTop = 0;
    updateUI();
    sendMessage({
      type: "selectSetlist",
      setlist: setlist,
    });
  }
}

function clearSetlistFilter() {
  appState.viewingSetlistId = null;
  renderSongs();
  renderSetlists();
  updateSongsHeader();
}

function updateSongsHeader() {
  const title = document.getElementById("songsHeaderTitle");
  const addBtn = document.getElementById("addToSetlistBtn");
  const clearBtn = document.getElementById("clearSetlistFilterBtn");
  if (!title) return;

  if (appState.viewingSetlistId) {
    const sl = appState.setlists.find((s) => s.id === appState.viewingSetlistId);
    if (sl) {
      title.textContent = "📋 " + sl.name;
      title.classList.add("filtered");
      if (clearBtn) clearBtn.style.display = "inline-block";
      if (addBtn) addBtn.style.display = canEditLibrary() ? "inline-block" : "none";
      return;
    }
  }
  title.textContent = "📚 Repertório";
  title.classList.remove("filtered");
  if (clearBtn) clearBtn.style.display = "none";
  if (addBtn) addBtn.style.display = "none";
}

function updateTranspose() {
  if (!appState.isHost) return;
  const value = Number.parseInt(document.getElementById("transposeSlider").value, 10) || 0;
  appState.transpose = value;
  document.getElementById("transposeValue").textContent = value > 0 ? `+${value}` : String(value);
  renderCifra();
  updateSongMeta();
  sendMessage({
    type: "transpose",
    value: value,
  });
}

function transposeBy(delta) {
  if (!appState.isHost) return;
  const value = appState.transpose + delta;
  if (value >= -12 && value <= 12) {
    document.getElementById("transposeSlider").value = value;
    updateTranspose();
  }
}

function transposeReset() {
  if (!appState.isHost) return;
  document.getElementById("transposeSlider").value = 0;
  updateTranspose();
}

function updateCapo() {
  if (!appState.isHost) return;
  const value = Number.parseInt(document.getElementById("capoSlider").value, 10) || 0;
  appState.capotraste = value;
  document.getElementById("capoValue").textContent = String(value);
  renderCifra();
  updateSongMeta();
  sendMessage({
    type: "capotraste",
    value: value,
  });
}

function updateAutoScroll() {
  if (!appState.isHost) return;
  const speed = Number.parseInt(document.getElementById("scrollSlider").value, 10) || 0;
  appState.autoScrollSpeed = speed;
  appState.isAutoScrolling = speed > 0;
  document.getElementById("scrollSpeed").textContent = String(speed);
  startAutoScroll();
  sendMessage({
    type: "autoScroll",
    speed: speed,
  });
}

function nextSong() {
  if (!appState.isHost || !appState.currentSetlist) return;
  sendMessage({ type: "nextSong" });
}

function previousSong() {
  if (!appState.isHost || !appState.currentSetlist) return;
  sendMessage({ type: "previousSong" });
}

function toggleStageMode() {
  if (!appState.isHost) return;
  sendMessage({
    type: "stageMode",
    enabled: !appState.stageMode,
  });
}

function toggleViewerMode() {
  appState.viewerMode = !appState.viewerMode;
  document.getElementById("container").classList.toggle("viewer-mode");
  document.getElementById("viewerModeBtn").style.display = appState.viewerMode ? "none" : "block";
  document.getElementById("normalModeBtn").style.display = appState.viewerMode ? "block" : "none";
  localStorage.setItem("cifrahub_viewerMode", appState.viewerMode);
}

// 🎤 MODO CANTOR
function toggleSingerMode() {
  appState.singerMode = !appState.singerMode;
  const btn = document.getElementById("singerModeBtn");
  if (btn) {
    btn.textContent = appState.singerMode ? "🎸 Cifra" : "🎤 Cantor";
    btn.classList.toggle("active");
  }
  const fontLabel = document.getElementById("fontSizeLabel");
  const slider = document.getElementById("fontSizeSlider");
  if (fontLabel) fontLabel.textContent = appState.singerMode ? "Cantor" : "Normal";
  if (slider) slider.value = appState.singerMode ? appState.singerFontSize : appState.fontSize;
  updateFontSizeDisplay();
  renderCifra();
  saveLocalData();
  showToast(appState.singerMode ? "🎤 Modo Cantor ativado" : "🎸 Modo Cifra ativado");
}

// 🔤 TAMANHO DA FONTE
function updateFontSize() {
  const slider = document.getElementById("fontSizeSlider");
  if (!slider) return;
  const val = parseInt(slider.value, 10) || 16;
  if (appState.singerMode) {
    appState.singerFontSize = val;
  } else {
    appState.fontSize = val;
  }
  updateFontSizeDisplay();
  renderCifra();
  saveLocalData();
}

function updateFontSizeDisplay() {
  const out = document.getElementById("fontSizeValue");
  if (!out) return;
  const val = appState.singerMode ? appState.singerFontSize : appState.fontSize;
  out.textContent = val + "px";
}

// ═══════════════════════════ AUTO-SCROLL ═══════════════════════════
function startAutoScroll() {
  if (autoScrollInterval) clearInterval(autoScrollInterval);

  if (appState.autoScrollSpeed > 0) {
    autoScrollInterval = setInterval(() => {
      const container = document.getElementById("cifraContainer");
      if (container) {
        const speed = appState.autoScrollSpeed / 10;
        container.scrollTop += speed;
      }
    }, 100);
  }
}

// ═══════════════════════════ TRANSPOSIÇÃO CROMÁTICA ═══════════════════════════
function noteToIndex(note) {
  if (!note) return -1;
  const direct = CONFIG.NOTES.indexOf(note);
  if (direct !== -1) return direct;
  const flat = CONFIG.NOTES_FLAT.indexOf(note);
  if (flat !== -1) return flat;
  return -1;
}

function transposeNote(note, semitones) {
  const idx = noteToIndex(note);
  if (idx === -1) return note;
  let newIdx = (idx + semitones) % 12;
  if (newIdx < 0) newIdx += 12;
  return CONFIG.NOTES[newIdx];
}

function transposeChord(chord, semitones) {
  if (!chord || chord.length === 0 || semitones === 0) return chord;

  const regex = /^([A-G])([#b]?)([^\/]*)(?:\/([A-G])([#b]?)(.*))?$/;
  const match = chord.trim().match(regex);

  if (!match) return chord;

  const rootLetter = match[1];
  const rootAccidental = match[2] || "";
  const suffix = match[3] || "";
  const bassLetter = match[4];
  const bassAccidental = match[5] || "";
  const bassSuffix = match[6] || "";

  const rootNote = rootLetter + rootAccidental;
  const newRoot = transposeNote(rootNote, semitones);

  let result = newRoot + suffix;

  if (bassLetter) {
    const bassNote = bassLetter + bassAccidental;
    const newBass = transposeNote(bassNote, semitones);
    result += "/" + newBass + bassSuffix;
  }

  return result;
}

// ═══════════════════════════ RENDERIZAÇÃO DA CIFRA (ESTILO CIFRA CLUB) ═══════════════════════════
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isChordToken(token) {
  return /^[A-G](#|b)?(m|maj|min|sus|dim|aug|add)?[0-9]*(\/[A-G](#|b)?)?$/.test(token);
}

function isChordLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\[[^\]]+\]$/.test(trimmed)) return false;
  const clean = trimmed.replace(/^\[[^\]]+\]\s*/, "");
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const valid = tokens.filter(isChordToken).length;
  return valid > 0 && valid >= Math.ceil(tokens.length * 0.65);
}

function wrapChordsInLine(line, semitones) {
  const regex =
    /(?:^|(?<=[^A-Za-z0-9#]))([A-G][#b]?(?:m|maj|min|sus|dim|aug|add)?[0-9]*(?:\/[A-G][#b]?)?)(?![A-Za-z0-9#])/g;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const chord = match[1];
    const trans = semitones !== 0 ? transposeChord(chord, semitones) : chord;
    const matchStart = match.index;
    result += escapeHtml(line.substring(lastIndex, matchStart));
    result += `<b class="cifra-chord">${escapeHtml(trans)}</b>`;
    lastIndex = matchStart + chord.length;
    regex.lastIndex = lastIndex;
  }
  result += escapeHtml(line.substring(lastIndex));
  return result;
}

function renderCifra() {
  const container = document.getElementById("cifraDisplay");
  if (!container) return;

  const fs = appState.singerMode ? appState.singerFontSize : appState.fontSize;
  container.style.fontSize = (fs || 16) + "px";

  if (!appState.currentSong) {
    container.className = "cifra-sheet";
    container.innerHTML =
      '<div style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 15px;">Nenhuma música selecionada.<br>Escolha uma música no repertório ao lado para começar.</div>';
    return;
  }

  const cifraText = appState.currentSong.cifra || "";
  const totalShift = (appState.transpose || 0) - (appState.capotraste || 0);
  const isSinger = !!appState.singerMode;

  const rawLines = cifraText.replace(/\r\n/g, "\n").split("\n");
  const htmlOutput = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. Linha em branco
    if (!trimmed) {
      htmlOutput.push('<span class="cifra-empty-line">\n</span>');
      continue;
    }

    // 2. Tom da música (ex: Tom: G)
    if (/^Tom:\s*[A-G]/i.test(trimmed)) {
      if (isSinger) continue;
      const transLine =
        totalShift !== 0
          ? trimmed.replace(/([A-G][#b]?m?)/g, (c) => transposeChord(c, totalShift))
          : trimmed;
      htmlOutput.push(`<span class="cifra-info">${escapeHtml(transLine)}</span>\n`);
      continue;
    }

    // 3. Seção pura (ex: [Intro], [Refrão], [Verso 1], [Solo], [Final])
    const sectionAlone = trimmed.match(/^\[([A-Za-zÀ-ÿ0-9\s\-_]+)\]$/);
    if (sectionAlone) {
      htmlOutput.push(`<span class="cifra-section">[${escapeHtml(sectionAlone[1])}]</span>\n`);
      continue;
    }

    // 4. Seção com acordes na mesma linha (ex: [Intro] E A D B7)
    const sectionWithChords = line.match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_]+\])\s*(.*)$/);
    if (sectionWithChords && isChordLine(sectionWithChords[2])) {
      if (isSinger) continue;
      const sec = `<span class="cifra-section">${escapeHtml(sectionWithChords[1])}</span> `;
      const chords = wrapChordsInLine(sectionWithChords[2], totalShift);
      htmlOutput.push(sec + chords + "\n");
      continue;
    }

    // 5. Linha de acordes tradicional (acima da letra, com espaços - formato nativo Cifra Club)
    if (isChordLine(line)) {
      if (isSinger) continue;
      htmlOutput.push(wrapChordsInLine(line, totalShift) + "\n");
      continue;
    }

    // 6. Linha com acordes embutidos no texto [C]Texto
    if (/\[([A-G][^\]]*)\]/.test(line)) {
      if (isSinger) {
        const cleanLyric = line.replace(/\[[^\]]+\]/g, "").trim();
        if (cleanLyric) {
          htmlOutput.push(`<span class="cifra-lyric-line">${escapeHtml(cleanLyric)}</span>\n`);
        }
        continue;
      }

      // Converte acordes embutidos para o alinhamento monoespaçado do Cifra Club
      let chordLine = "";
      let lyricLine = "";
      const regex = /\[([A-G][^\]]*)\]|([^\[]+)/g;
      let match;

      while ((match = regex.exec(line)) !== null) {
        if (match[1]) {
          const rawChord = match[1];
          const chord = totalShift !== 0 ? transposeChord(rawChord, totalShift) : rawChord;
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

      htmlOutput.push(wrapChordsInLine(chordLine, 0) + "\n");
      htmlOutput.push(escapeHtml(lyricLine) + "\n");
      continue;
    }

    // 7. Linha de letra comum
    htmlOutput.push(escapeHtml(line) + "\n");
  }

  container.className = "cifra-sheet" + (isSinger ? " singer-mode" : "");
  container.innerHTML = htmlOutput.join("");
}

// ═══════════════════════════ RENDERIZAR INTERFACE ═══════════════════════════
function renderSongs() {
  const list = document.getElementById("songsList");
  if (!list) return;
  list.innerHTML = "";

  let songsToShow;
  let filteredSetlist = null;
  if (appState.viewingSetlistId) {
    filteredSetlist = appState.setlists.find((s) => s.id === appState.viewingSetlistId);
    if (filteredSetlist) {
      songsToShow = filteredSetlist.songs
        .map((id) => appState.songs.find((s) => s.id === id))
        .filter((s) => !!s)
        .map((s) => ({ song: s, index: appState.songs.findIndex((x) => x.id === s.id) }));
    } else {
      songsToShow = appState.songs.map((s, i) => ({ song: s, index: i }));
    }
  } else {
    songsToShow = appState.songs.map((s, i) => ({ song: s, index: i }));
  }

  const search = document.getElementById("searchInput")?.value.trim().toLocaleLowerCase("pt-BR");
  if (search) {
    songsToShow = songsToShow.filter(({ song }) =>
      `${song.title} ${song.artist ?? ""}`.toLocaleLowerCase("pt-BR").includes(search),
    );
  }

  if (songsToShow.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText =
      "color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;";
    empty.textContent = filteredSetlist
      ? 'Setlist vazia. Clique em "+" para adicionar músicas.'
      : "Nenhuma música no repertório.";
    list.appendChild(empty);
    return;
  }

  songsToShow.forEach(({ song, index }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "song-item-wrapper";

    const div = document.createElement("div");
    div.className = "song-item" + (appState.currentSong?.id === song.id ? " active" : "");
    div.innerHTML = `<div class="song-title">${escapeHtml(song.title)}</div><div class="song-artist">${escapeHtml(song.artist || "")}</div>`;
    div.onclick = () => {
      if (appState.isHost) {
        selectSong(index);
      } else {
        showToast("⚠️ Apenas o Líder pode trocar a música");
      }
    };
    wrapper.appendChild(div);

    if (filteredSetlist && canEditLibrary()) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "song-item-remove";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remover desta setlist";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        const newSongs = filteredSetlist.songs.filter((sid) => sid !== song.id);
        sendMessage({
          type: "updateSetlist",
          setlist: {
            id: filteredSetlist.id,
            name: filteredSetlist.name,
            songs: newSongs,
          },
        });
      };
      wrapper.appendChild(removeBtn);
    }

    list.appendChild(wrapper);
  });
}

function renderSetlists() {
  const list = document.getElementById("setlistsList");
  list.innerHTML = "";
  const createButton = document.getElementById("createSetlistButton");
  if (createButton) createButton.hidden = !canEditLibrary();

  appState.setlists.forEach((setlist) => {
    const isActiveSetlist =
      appState.viewingSetlistId === setlist.id || appState.currentSetlist?.id === setlist.id;
    const div = document.createElement("div");
    div.className = "setlist-item" + (isActiveSetlist ? " active" : "");
    const name = document.createElement("div");
    name.className = "setlist-name";
    name.textContent = setlist.name;
    const count = document.createElement("div");
    count.className = "setlist-count";
    count.textContent = `${setlist.songs.length} música(s)`;
    div.append(name, count);
    div.onclick = () => selectSetlist(setlist.id);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; gap: 5px; margin-top: 6px;";

    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.style.cssText = "flex: 1; font-size: 11px; padding: 5px; justify-content: center;";
    editBtn.textContent = "✎ Editar";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (canEditLibrary()) {
        showEditSetlistModal(setlist.id);
      } else {
        showToast("⚠️ Seu papel não permite editar este repertório");
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.style.cssText =
      "flex: 1; font-size: 11px; padding: 5px; color: var(--danger); justify-content: center;";
    deleteBtn.textContent = "Remover";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (canEditLibrary()) {
        if (confirm(`Remover a setlist "${setlist.name}"?`)) {
          void deleteSetlist(setlist.id);
        }
      } else {
        showToast("⚠️ Seu papel não permite editar este repertório");
      }
    };

    btnRow.appendChild(editBtn);
    btnRow.appendChild(deleteBtn);
    if (canEditLibrary()) div.appendChild(btnRow);
    list.appendChild(div);
  });
}

async function deleteSetlist(id) {
  try {
    await window.CifraHubApi.request(`/api/bands/${activeBandId()}/playlists/${id}`, {
      method: "DELETE",
    });
    appState.setlists = appState.setlists.filter((setlist) => setlist.id !== id);
    if (appState.viewingSetlistId === id) appState.viewingSetlistId = null;
    renderSetlists();
    renderSongs();
    updateSongsHeader();
    showToast("Playlist removida.");
  } catch (error) {
    showToast(error.message);
  }
}

function updateUI() {
  if (appState.currentSong) {
    document.getElementById("currentSongTitle").textContent = appState.currentSong.title;
    const totalShift = (appState.transpose || 0) - (appState.capotraste || 0);
    let keyDisplay = appState.currentSong.key || "";
    if (keyDisplay && totalShift !== 0) {
      const transKey = transposeChord(keyDisplay, totalShift);
      keyDisplay = `${transKey} (Original: ${appState.currentSong.key})`;
    }
    const artist = appState.currentSong.artist ? `${appState.currentSong.artist} • ` : "";
    const tempo = appState.currentSong.tempo ? ` • ${appState.currentSong.tempo} BPM` : "";
    const meta = document.getElementById("currentSongMeta");
    meta.textContent = `${artist}Tom: ${keyDisplay}${tempo}`;
    const bpm = Number(appState.currentSong.tempo) || 0;
    meta.style.setProperty("--bpm-duration", bpm ? `${60 / bpm}s` : "1s");
    meta.classList.toggle("bpm-pulse", bpm > 0);
  } else {
    document.getElementById("currentSongTitle").textContent = "Selecione uma música";
    const meta = document.getElementById("currentSongMeta");
    meta.textContent = "Escolha uma música no repertório";
    meta.classList.remove("bpm-pulse");
  }

  document.getElementById("transposeSlider").value = appState.transpose;
  document.getElementById("transposeValue").textContent =
    (appState.transpose > 0 ? "+" : "") + appState.transpose;
  document.getElementById("capoSlider").value = appState.capotraste;
  document.getElementById("capoValue").textContent = appState.capotraste;
  document.getElementById("scrollSlider").value = appState.autoScrollSpeed;
  document.getElementById("scrollSpeed").textContent = appState.autoScrollSpeed;

  const container = document.getElementById("container");
  if (appState.stageMode) {
    container.classList.add("stage-mode");
  } else {
    container.classList.remove("stage-mode");
  }

  if (appState.viewerMode) {
    container.classList.add("viewer-mode");
    document.getElementById("viewerModeBtn").style.display = "none";
    document.getElementById("normalModeBtn").style.display = "block";
  } else {
    container.classList.remove("viewer-mode");
    document.getElementById("viewerModeBtn").style.display = "block";
    document.getElementById("normalModeBtn").style.display = "none";
  }

  const singerBtn = document.getElementById("singerModeBtn");
  if (singerBtn) {
    singerBtn.textContent = appState.singerMode ? "🎸 Cifra" : "🎤 Cantor";
    singerBtn.classList.toggle("active", appState.singerMode);
  }

  const fontSlider = document.getElementById("fontSizeSlider");
  const fontLabel = document.getElementById("fontSizeLabel");
  if (fontSlider)
    fontSlider.value = appState.singerMode ? appState.singerFontSize : appState.fontSize;
  if (fontLabel) fontLabel.textContent = appState.singerMode ? "Cantor" : "Normal";
  updateFontSizeDisplay();

  updateSongsHeader();

  const hostControls = document.getElementById("hostControlsGroup");
  const canEdit = canEditLibrary();
  hostControls.style.display = canEdit ? "block" : "none";
  if (appState.isHost) {
    document.getElementById("hostBadge").style.display = "block";
    document.getElementById("viewerBadge").style.display = "none";
    document.getElementById("roleDisplay").textContent = "LÍDER 🎸";
  } else {
    document.getElementById("hostBadge").style.display = "none";
    document.getElementById("viewerBadge").style.display = "block";
    document.getElementById("roleDisplay").textContent = "VIEWER 👁️";
  }

  const canPrev = appState.isHost && appState.currentSetlist && appState.currentSongIndex > 0;
  const canNext =
    appState.isHost &&
    appState.currentSetlist &&
    appState.currentSongIndex < appState.currentSetlist.songs.length - 1;
  document.getElementById("prevBtn").disabled = !canPrev;
  document.getElementById("nextBtn").disabled = !canNext;

  const stageBtn = document.getElementById("stageModeBtn");
  if (stageBtn) stageBtn.disabled = !appState.isHost;

  document.getElementById("dockTransposeDown").disabled = !appState.isHost;
  document.getElementById("dockTransposeUp").disabled = !appState.isHost;
  document.getElementById("dockAutoScroll").disabled = !appState.isHost;
  document.getElementById("dockStageMode").disabled = !appState.isHost;
  document.getElementById("dockAutoScroll").classList.toggle("active", appState.isAutoScrolling);
  window.dispatchEvent(new Event("cifrahub:stage-state"));

  document.getElementById("clientsCount").textContent = appState.clientsCount;

  renderCifra();

  const hostOnly = !appState.isHost;
  document.getElementById("transposeSlider").disabled = hostOnly;
  document.getElementById("capoSlider").disabled = hostOnly;
  document.getElementById("scrollSlider").disabled = hostOnly;
}

function updateSongMeta() {
  if (!appState.currentSong) return;
  const song = appState.currentSong;
  const shift = (appState.transpose || 0) - (appState.capotraste || 0);
  const originalKey = song.key || "";
  const currentKey = shift ? transposeChord(originalKey, shift) : originalKey;
  const keyLabel =
    currentKey === originalKey ? currentKey : `${currentKey} (Original: ${originalKey})`;
  const artist = song.artist ? `${song.artist} • ` : "";
  const tempo = song.tempo ? ` • ${song.tempo} BPM` : "";
  document.getElementById("currentSongMeta").textContent = `${artist}Tom: ${keyLabel}${tempo}`;
}

function updateConnectionStatus(status, color) {
  const el = document.getElementById("connectionStatus");
  const dot = document.createElement("span");
  dot.className = "connection-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.classList.toggle("is-connected", status === "Conectado");
  dot.style.backgroundColor = status === "Conectado" ? "var(--gold)" : color;
  const label = document.createElement("span");
  label.textContent = status;
  el.replaceChildren(dot, label);
  el.style.color = color;
}

// ═══════════════════════════ MODAIS ═══════════════════════════
function showCreateSongModal() {
  if (!canEditLibrary()) return;
  document.getElementById("createSongModal").classList.add("active");
}

function showEditSongModal() {
  if (!canEditLibrary() || !appState.currentSong) return;
  document.getElementById("editSongTitle").value = appState.currentSong.title;
  document.getElementById("editSongArtist").value = appState.currentSong.artist;
  document.getElementById("editSongKey").value = appState.currentSong.key;
  document.getElementById("editSongTempo").value = appState.currentSong.tempo;
  document.getElementById("editSongCifra").value = appState.currentSong.cifra;
  document.getElementById("editSongModal").classList.add("active");
}

function showCreateSetlistModal() {
  if (!canEditLibrary()) return;
  appState.editingSetlist = null;
  const title = document.getElementById("createSetlistModal").querySelector(".modal-title");
  title.textContent = "📋 Nova Setlist";
  document.getElementById("newSetlistName").value = "";
  const checkboxDiv = document.getElementById("setlistSongsCheckbox");
  checkboxDiv.innerHTML = "";

  appState.songs.forEach((song) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display: block; margin-bottom: 8px; cursor: pointer; color: var(--text-primary); font-size: 13px;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = song.id;
    input.style.marginRight = "8px";
    label.appendChild(input);
    label.appendChild(document.createTextNode(`${song.title} - ${song.artist}`));
    checkboxDiv.appendChild(label);
  });

  document.getElementById("createSetlistModal").classList.add("active");
}

function showEditSetlistModal(id) {
  if (!canEditLibrary()) return;
  const setlist = appState.setlists.find((s) => s.id === id);
  if (!setlist) return;

  appState.editingSetlist = setlist;
  const title = document.getElementById("createSetlistModal").querySelector(".modal-title");
  title.textContent = "✎ Editar Setlist";
  document.getElementById("newSetlistName").value = setlist.name;
  const checkboxDiv = document.getElementById("setlistSongsCheckbox");
  checkboxDiv.innerHTML = "";

  appState.songs.forEach((song) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display: block; margin-bottom: 8px; cursor: pointer; color: var(--text-primary); font-size: 13px;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = song.id;
    input.checked = setlist.songs.includes(song.id);
    input.style.marginRight = "8px";
    label.appendChild(input);
    label.appendChild(document.createTextNode(`${song.title} - ${song.artist}`));
    checkboxDiv.appendChild(label);
  });

  document.getElementById("createSetlistModal").classList.add("active");
}

function showSettingsModal() {
  document.getElementById("deviceNameInput").value = appState.deviceName;
  document.getElementById("clientIdDisplay").value = appState.clientId;
  document.getElementById("serverAddress").textContent = window.location.hostname;
  document.getElementById("serverStatus").textContent =
    appState.ws?.readyState === 1 ? "✅ Conectado" : "❌ Desconectado";
  document.getElementById("settingsModal").classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

// ═══════════════════════════ ADICIONAR MÚSICAS À SETLIST ═══════════════════════════
function showAddToSetlistModal() {
  if (!canEditLibrary()) {
    showToast("⚠️ Seu papel não permite editar este repertório");
    return;
  }
  if (!appState.viewingSetlistId) return;
  const setlist = appState.setlists.find((s) => s.id === appState.viewingSetlistId);
  if (!setlist) return;

  document.getElementById("addToSetlistInfo").textContent = `Setlist: ${setlist.name}`;
  const box = document.getElementById("addToSetlistCheckbox");
  box.innerHTML = "";

  const available = appState.songs.filter((s) => !setlist.songs.includes(s.id));
  if (available.length === 0) {
    box.innerHTML =
      '<div style="color: var(--text-muted); font-size: 12px;">Todas as músicas já estão nesta setlist.</div>';
  } else {
    available.forEach((song) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display: block; margin-bottom: 8px; cursor: pointer; color: var(--text-primary); font-size: 13px;";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = song.id;
      input.style.marginRight = "8px";
      label.appendChild(input);
      label.appendChild(
        document.createTextNode(`${song.title}${song.artist ? " - " + song.artist : ""}`),
      );
      box.appendChild(label);
    });
  }
  document.getElementById("addToSetlistModal").classList.add("active");
}

function confirmAddToSetlist() {
  if (!canEditLibrary() || !appState.viewingSetlistId) return;
  const setlist = appState.setlists.find((s) => s.id === appState.viewingSetlistId);
  if (!setlist) return;

  const checked = Array.from(
    document.querySelectorAll('#addToSetlistCheckbox input[type="checkbox"]:checked'),
  ).map((cb) => cb.value);

  if (checked.length === 0) {
    showToast("⚠️ Selecione pelo menos uma música");
    return;
  }

  const newSongs = [...setlist.songs];
  checked.forEach((id) => {
    if (!newSongs.includes(id)) newSongs.push(id);
  });

  void window.CifraHubApi.request(`/api/bands/${activeBandId()}/playlists/${setlist.id}`, {
    method: "PUT",
    body: { id: setlist.id, name: setlist.name, songs: newSongs },
  })
    .then((result) => {
      appState.setlists = appState.setlists.map((item) =>
        item.id === setlist.id ? result.data : item,
      );
      renderSetlists();
      renderSongs();
      closeModal("addToSetlistModal");
      showToast(`${checked.length} música(s) adicionada(s).`);
    })
    .catch((error) => showToast(error.message));
}

// ═══════════════════════════ REMOVER MÚSICA ═══════════════════════════
async function deleteCurrentSong() {
  if (!canEditLibrary() || !appState.currentSong) {
    showToast("⚠️ Selecione uma música primeiro");
    return;
  }
  if (
    !confirm(
      `Remover "${appState.currentSong.title}" do repertório?\n\nIsso também removerá a música de todas as setlists.`,
    )
  )
    return;

  try {
    await window.CifraHubApi.request(
      `/api/bands/${activeBandId()}/songs/${appState.currentSong.id}`,
      { method: "DELETE" },
    );
    appState.songs = appState.songs.filter((song) => song.id !== appState.currentSong.id);
    appState.setlists = appState.setlists.map((list) => ({
      ...list,
      songs: list.songs.filter((id) => id !== appState.currentSong.id),
    }));
    appState.currentSong = null;
    appState.currentSongIndex = null;
    renderSongs();
    renderSetlists();
    updateUI();
    showToast("Música removida.");
  } catch (error) {
    showToast(error.message);
  }
}

// ═══════════════════════════ IMPORTAÇÃO DE .TXT ═══════════════════════════
function handleTxtImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const raw = String(e.target.result || "");
    document.getElementById("newSongCifra").value = raw;
    showToast("✅ TXT importado com sucesso");
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

async function createSong(e) {
  e.preventDefault();
  if (!canEditLibrary()) return;

  const title = document.getElementById("newSongTitle").value;
  const artist = document.getElementById("newSongArtist").value;
  const key = document.getElementById("newSongKey").value;
  const tempo = parseInt(document.getElementById("newSongTempo").value) || 120;
  const cifra = document.getElementById("newSongCifra").value;

  try {
    const result = await window.CifraHubApi.request(`/api/bands/${activeBandId()}/songs`, {
      method: "POST",
      body: { title, artist, key, tempo, cifra },
    });
    appState.songs.push(result.data ?? result);
    renderSongs();
    closeModal("createSongModal");
    document.querySelector("#createSongModal form").reset();
    showToast("Música adicionada.");
  } catch (error) {
    showToast(error.message);
  }
}

async function updateSong(e) {
  e.preventDefault();
  if (!canEditLibrary() || !appState.currentSong) return;

  const song = {
    id: appState.currentSong.id,
    title: document.getElementById("editSongTitle").value,
    artist: document.getElementById("editSongArtist").value,
    key: document.getElementById("editSongKey").value,
    tempo: parseInt(document.getElementById("editSongTempo").value) || 120,
    cifra: document.getElementById("editSongCifra").value,
  };

  try {
    const { id, ...fields } = song;
    await window.CifraHubApi.request(`/api/bands/${activeBandId()}/songs/${id}`, {
      method: "PUT",
      body: fields,
    });
    appState.songs = appState.songs.map((item) => (item.id === song.id ? song : item));
    appState.currentSong = song;
    renderSongs();
    renderCifra();
    closeModal("editSongModal");
    showToast("Música atualizada.");
  } catch (error) {
    showToast(error.message);
  }
}

async function createSetlist(e) {
  e.preventDefault();
  if (!canEditLibrary()) return;

  const name = document.getElementById("newSetlistName").value;
  if (!name.trim()) {
    showToast("❌ Nome da setlist não pode ser vazio");
    return;
  }

  const checkboxes = document.querySelectorAll(
    '#setlistSongsCheckbox input[type="checkbox"]:checked',
  );
  const songs = Array.from(checkboxes).map((cb) => cb.value);

  try {
    const existing = appState.editingSetlist;
    const path = `/api/bands/${activeBandId()}/playlists${existing ? `/${existing.id}` : ""}`;
    const result = await window.CifraHubApi.request(path, {
      method: existing ? "PUT" : "POST",
      body: { ...(existing ? { id: existing.id } : {}), name, songs },
    });
    if (existing)
      appState.setlists = appState.setlists.map((item) =>
        item.id === existing.id ? result.data : item,
      );
    else appState.setlists.push(result.data);
    appState.editingSetlist = null;
    renderSetlists();
    closeModal("createSetlistModal");
    showToast(existing ? "Playlist atualizada." : "Playlist criada.");
  } catch (error) {
    showToast(error.message);
  }
}

// ═══════════════════════════ ARMAZENAMENTO LOCAL ═══════════════════════════
function saveLocalData() {
  localStorage.setItem("cifrahub_deviceName", appState.deviceName);
  localStorage.setItem("cifrahub_stageMode", appState.stageMode);
  localStorage.setItem("cifrahub_viewerMode", appState.viewerMode);
  localStorage.setItem("cifrahub_singerMode", appState.singerMode);
  localStorage.setItem("cifrahub_fontSize", appState.fontSize);
  localStorage.setItem("cifrahub_singerFontSize", appState.singerFontSize);
  localStorage.setItem("cifrahub_theme", appState.theme);
}

function loadLocalData() {
  appState.deviceName = localStorage.getItem("cifrahub_deviceName") || "CifraHub Device";
  appState.stageMode = localStorage.getItem("cifrahub_stageMode") === "true";
  appState.viewerMode = localStorage.getItem("cifrahub_viewerMode") === "true";
  appState.singerMode = localStorage.getItem("cifrahub_singerMode") === "true";
  appState.fontSize = parseInt(localStorage.getItem("cifrahub_fontSize") || "16", 10);
  appState.singerFontSize = parseInt(localStorage.getItem("cifrahub_singerFontSize") || "28", 10);
  appState.theme = "light";
}

// ═══════════════════════════ NOTIFICAÇÕES ═══════════════════════════
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

window.CifraHubApp = Object.freeze({
  state: appState,
  async setLibrary(songs, setlists) {
    appState.songs = songs;
    appState.setlists = setlists;
    appState.currentSong = null;
    appState.currentSetlist = null;
    appState.currentSongIndex = null;
    renderSongs();
    renderSetlists();
    updateUI();
  },
  startGuest(code, nickname) {
    appState.isHost = false;
    appState.deviceName = nickname;
    window.CifraHubContext.connection = { code, token: null };
    connectWebSocket();
    updateUI();
  },
  startAuthenticatedSession(session, band) {
    appState.deviceName = window.CifraHubContext.user?.displayName ?? "Músico";
    window.CifraHubContext.activeBand = band;
    window.CifraHubContext.connection = {
      sessionId: session.id,
      code: session.id ? null : session.code,
      token: localStorage.getItem(window.CifraHubApi.tokenKey),
    };
    connectWebSocket();
  },
  disconnect() {
    window.CifraHubContext.connection = null;
    disconnectWebSocket();
    appState.isHost = false;
    appState.isAutoScrolling = false;
    updateConnectionStatus("Aguardando sessão", "var(--text-muted)");
    updateUI();
  },
});

window.updateUI = updateUI;
window.updateTranspose = updateTranspose;
window.updateAutoScroll = updateAutoScroll;
window.nextSong = nextSong;
window.previousSong = previousSong;
window.toggleStageMode = toggleStageMode;
window.showToast = showToast;
Object.assign(window, {
  showAddToSetlistModal,
  clearSetlistFilter,
  showCreateSetlistModal,
  toggleSingerMode,
  toggleViewerMode,
  transposeBy,
  transposeReset,
  updateCapo,
  updateFontSize,
  showCreateSongModal,
  showEditSongModal,
  deleteCurrentSong,
  showSettingsModal,
  createSong,
  handleTxtImport,
  closeModal,
  updateSong,
  confirmAddToSetlist,
  createSetlist,
});

// Inicia a interface e verifica a conta antes de abrir qualquer sala.
init();
