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

  // Botões de navegação e modos no header
  document.getElementById("prevBtn")?.addEventListener("click", previousSong);
  document.getElementById("nextBtn")?.addEventListener("click", nextSong);
  document.getElementById("singerModeBtn")?.addEventListener("click", toggleSingerMode);
  document.getElementById("viewerModeBtn")?.addEventListener("click", toggleViewerMode);
  document.getElementById("normalModeBtn")?.addEventListener("click", toggleViewerMode);
  document.getElementById("stageModeBtn")?.addEventListener("click", toggleStageMode);

  // Sliders e botões de controle
  const tSlider = document.getElementById("transposeSlider");
  tSlider?.addEventListener("input", updateTranspose);
  tSlider?.addEventListener("change", updateTranspose);

  document.getElementById("transposeDownBtn")?.addEventListener("click", () => transposeBy(-1));
  document.getElementById("transposeResetBtn")?.addEventListener("click", transposeReset);
  document.getElementById("transposeUpBtn")?.addEventListener("click", () => transposeBy(1));

  const cSlider = document.getElementById("capoSlider");
  cSlider?.addEventListener("input", updateCapo);
  cSlider?.addEventListener("change", updateCapo);

  const sSlider = document.getElementById("scrollSlider");
  sSlider?.addEventListener("input", updateAutoScroll);
  sSlider?.addEventListener("change", updateAutoScroll);

  document.getElementById("fontSizeSlider")?.addEventListener("input", updateFontSize);

  // Ações de repertório e setlists
  document.getElementById("newSongBtn")?.addEventListener("click", showCreateSongModal);
  document.getElementById("createSongBtn")?.addEventListener("click", showCreateSongModal);
  document.getElementById("editSongBtn")?.addEventListener("click", showEditSongModal);
  document.getElementById("deleteSongBtn")?.addEventListener("click", deleteCurrentSong);
  document.getElementById("settingsBtn")?.addEventListener("click", showSettingsModal);
  document.getElementById("createSetlistButton")?.addEventListener("click", showCreateSetlistModal);
  document.getElementById("addToSetlistBtn")?.addEventListener("click", showAddToSetlistModal);
  document.getElementById("clearSetlistFilterBtn")?.addEventListener("click", clearSetlistFilter);

  // Formulários com preventDefault
  document.querySelector("#createSongModal form")?.addEventListener("submit", createSong);
  document.querySelector("#editSongModal form")?.addEventListener("submit", updateSong);
  document.querySelector("#createSetlistModal form")?.addEventListener("submit", createSetlist);

  // Fechar modais ao clicar no backdrop escuro
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("active");
    });
  });

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
        console.log(" Conectado ao servidor");
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
        console.error("Erro WebSocket:", error);
        updateConnectionStatus("Erro", "var(--danger)");
      },
      onClose: (event) => {
        console.log("Desconectado");
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
      if (message.clients) appState.connectedClients = message.clients;
      syncState(message.state);
      renderSongs();
      renderSetlists();
      updateUI();
      showToast(`${message.isHost ? "Você é o Líder de Louvor" : "Você é um Visualizador"}`);
      break;

    case "stateSync":
      syncState(message.state);
      appState.clientsCount = message.clientsCount;
      updateUI();
      break;

    case "clientsUpdate":
      appState.clientsCount = message.clientsCount;
      if (message.clients) appState.connectedClients = message.clients;
      updateUI();
      renderMusiciansModal();
      break;

    case "hostTransferred":
      if (message.newHostId === appState.clientId) {
        appState.isHost = true;
        showToast("Você agora é o Líder do Palco (Host)!");
      } else if (message.oldHostId === appState.clientId) {
        appState.isHost = false;
        showToast(`O controle do palco foi passado para ${message.newHostName ?? "outro integrante"}.`);
      } else {
        showToast(`Novo líder do palco: ${message.newHostName ?? "Músico"}`);
      }
      if (message.clients) appState.connectedClients = message.clients;
      updateUI();
      renderMusiciansModal();
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
        showToast("Você é o novo Líder de Louvor!");
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
      showToast("Música adicionada com sucesso.");
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
      showToast("Música atualizada com sucesso.");
      break;

    case "setlistCreated":
      appState.setlists.push(message.setlist);
      renderSetlists();
      saveLocalData();
      showToast("Setlist criada com sucesso.");
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
      showToast(" Setlist removida");
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
      showToast("Música removida com sucesso.");
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
function selectSongLocal(song, index) {
  appState.currentSong = song;
  appState.currentSongIndex = index;
  appState.transpose = 0;
  appState.capotraste = 0;
  const tSlider = document.getElementById("transposeSlider");
  if (tSlider) tSlider.value = 0;
  const cSlider = document.getElementById("capoSlider");
  if (cSlider) cSlider.value = 0;
  appState.scrollPosition = 0;
  appState.isAutoScrolling = false;
  const container = document.getElementById("cifraContainer");
  if (container) container.scrollTop = 0;
  updateUI();
  renderCifra();
}

function selectSong(index) {
  const song = appState.songs[index];
  if (!song) return;
  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    selectSongLocal(song, index);
    sendMessage({
      type: "selectSong",
      song: song,
      index: index,
    });
    return;
  }
  if (!appState.ws || appState.ws.readyState !== 1) {
    selectSongLocal(song, index);
    return;
  }
  showToast(" Apenas o Líder pode trocar a música");
}

function selectSetlist(id) {
  const setlist = appState.setlists.find((s) => s.id === id);
  if (!setlist) return;

  appState.viewingSetlistId = id;
  renderSongs();
  renderSetlists();
  updateSongsHeader();

  const firstSong = appState.songs.find((song) => song.id === setlist.songs[0]) ?? null;

  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    appState.currentSetlist = setlist;
    appState.currentSongIndex = 0;
    appState.currentSong = firstSong;
    appState.transpose = 0;
    appState.capotraste = 0;
    appState.scrollPosition = 0;
    appState.isAutoScrolling = false;
    appState.autoScrollSpeed = 0;
    const container = document.getElementById("cifraContainer");
    if (container) container.scrollTop = 0;
    updateUI();
    renderCifra();
    sendMessage({
      type: "selectSetlist",
      setlist: setlist,
    });
  } else if (!appState.ws || appState.ws.readyState !== 1) {
    appState.currentSetlist = setlist;
    appState.currentSongIndex = 0;
    appState.currentSong = firstSong;
    appState.transpose = 0;
    appState.capotraste = 0;
    appState.scrollPosition = 0;
    appState.isAutoScrolling = false;
    appState.autoScrollSpeed = 0;
    const container = document.getElementById("cifraContainer");
    if (container) container.scrollTop = 0;
    updateUI();
    renderCifra();
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
  const newSongBtn = document.getElementById("newSongBtn");
  const addBtn = document.getElementById("addToSetlistBtn");
  const clearBtn = document.getElementById("clearSetlistFilterBtn");
  if (!title) return;

  if (newSongBtn) {
    newSongBtn.style.display = (!appState.viewingSetlistId && canEditLibrary()) ? "inline-block" : "none";
  }

  if (appState.viewingSetlistId) {
    const sl = appState.setlists.find((s) => s.id === appState.viewingSetlistId);
    if (sl) {
      title.textContent = "Setlist: " + sl.name;
      title.classList.add("filtered");
      if (clearBtn) clearBtn.style.display = "inline-block";
      if (addBtn) addBtn.style.display = canEditLibrary() ? "inline-block" : "none";
      return;
    }
  }
  title.textContent = "Repertório";
  title.classList.remove("filtered");
  if (clearBtn) clearBtn.style.display = "none";
  if (addBtn) addBtn.style.display = "none";
}

function updateTranspose() {
  const slider = document.getElementById("transposeSlider");
  const value = Number.parseInt(slider?.value, 10) || 0;
  appState.transpose = value;
  const valEl = document.getElementById("transposeValue");
  if (valEl) valEl.textContent = value > 0 ? `+${value}` : String(value);
  renderCifra();
  updateSongMeta();
  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    sendMessage({
      type: "transpose",
      value: value,
    });
  }
}

function transposeBy(delta) {
  const value = appState.transpose + delta;
  if (value >= -12 && value <= 12) {
    const slider = document.getElementById("transposeSlider");
    if (slider) slider.value = value;
    updateTranspose();
  }
}

function transposeReset() {
  const slider = document.getElementById("transposeSlider");
  if (slider) slider.value = 0;
  updateTranspose();
}

function updateCapo() {
  const slider = document.getElementById("capoSlider");
  const value = Number.parseInt(slider?.value, 10) || 0;
  appState.capotraste = value;
  const valEl = document.getElementById("capoValue");
  if (valEl) valEl.textContent = String(value);
  renderCifra();
  updateSongMeta();
  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    sendMessage({
      type: "capotraste",
      value: value,
    });
  }
}

function updateAutoScroll() {
  const slider = document.getElementById("scrollSlider");
  const speed = Number.parseInt(slider?.value, 10) || 0;
  appState.autoScrollSpeed = speed;
  appState.isAutoScrolling = speed > 0;
  const valEl = document.getElementById("scrollSpeed");
  if (valEl) valEl.textContent = String(speed);
  startAutoScroll();
  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    sendMessage({
      type: "autoScroll",
      speed: speed,
    });
  }
}

function getActiveSongList() {
  if (appState.currentSetlist && appState.currentSetlist.songs && appState.currentSetlist.songs.length > 0) {
    const list = appState.currentSetlist.songs
      .map((id) => appState.songs.find((s) => s.id === id))
      .filter(Boolean);
    if (list.length > 0) return list;
  }
  return appState.songs;
}

function nextSong() {
  const songs = getActiveSongList();
  if (songs.length <= 1) return;
  const currentId = appState.currentSong?.id;
  const currentIndex = currentId ? songs.findIndex((s) => s.id === currentId) : -1;
  const nextIdx = currentIndex + 1;
  if (nextIdx < songs.length) {
    const targetSong = songs[nextIdx];
    const realIdx = appState.songs.findIndex((s) => s.id === targetSong.id);
    selectSong(realIdx >= 0 ? realIdx : nextIdx);
  }
}

function previousSong() {
  const songs = getActiveSongList();
  if (songs.length <= 1) return;
  const currentId = appState.currentSong?.id;
  const currentIndex = currentId ? songs.findIndex((s) => s.id === currentId) : -1;
  const prevIdx = currentIndex - 1;
  if (prevIdx >= 0) {
    const targetSong = songs[prevIdx];
    const realIdx = appState.songs.findIndex((s) => s.id === targetSong.id);
    selectSong(realIdx >= 0 ? realIdx : prevIdx);
  }
}

function toggleStageMode() {
  appState.stageMode = !appState.stageMode;
  updateUI();
  if (appState.isHost && appState.ws && appState.ws.readyState === 1) {
    sendMessage({
      type: "stageMode",
      enabled: appState.stageMode,
    });
  }
}

function toggleViewerMode() {
  appState.viewerMode = !appState.viewerMode;
  document.getElementById("container").classList.toggle("viewer-mode");
  document.getElementById("viewerModeBtn").style.display = appState.viewerMode ? "none" : "block";
  document.getElementById("normalModeBtn").style.display = appState.viewerMode ? "block" : "none";
  localStorage.setItem("cifrahub_viewerMode", appState.viewerMode);
}

// MODO CANTOR
function toggleSingerMode() {
  appState.singerMode = !appState.singerMode;
  const btn = document.getElementById("singerModeBtn");
  if (btn) {
    btn.textContent = appState.singerMode ? " Cifra" : " Cantor";
    btn.classList.toggle("active");
  }
  const fontLabel = document.getElementById("fontSizeLabel");
  const slider = document.getElementById("fontSizeSlider");
  if (fontLabel) fontLabel.textContent = appState.singerMode ? "Cantor" : "Normal";
  if (slider) slider.value = appState.singerMode ? appState.singerFontSize : appState.fontSize;
  updateFontSizeDisplay();
  updateUI();
  renderCifra();
  saveLocalData();
  showToast(appState.singerMode ? " Modo Cantor ativado" : " Modo Cifra ativado");
}

// TAMANHO DA FONTE
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

function transposeChord(chord, semitones) {
  if (window.transporSemitons) {
    return window.transporSemitons(chord, semitones, appState.currentSong?.key);
  }
  return chord;
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

function inlineToTwoLines(line) {
  let chordLine = "";
  let lyricLine = "";
  const cleanLine = line.replace(/\[\s*\]/g, "");
  const regex = /\[([^\]]+)\]|([^\[]+)/g;
  let match;

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
  return { chordLine, lyricLine };
}

function formatChordLine(line, semitones) {
  const regex = /\S+/g;
  let match;
  let lastIdx = 0;
  let result = "";

  while ((match = regex.exec(line)) !== null) {
    const rawToken = match[0];
    const col = match.index;

    if (col > lastIdx) {
      result += " ".repeat(col - lastIdx);
    }

    if (isChordToken(rawToken)) {
      const trans = semitones !== 0 ? transposeChord(rawToken, semitones) : rawToken;
      result += '<b class="cifra-chord">' + escapeHtml(trans) + '</b>';
    } else {
      result += escapeHtml(rawToken);
    }

    lastIdx = col + rawToken.length;
  }

  if (lastIdx < line.length) {
    result += " ".repeat(line.length - lastIdx);
  }

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

  let cifraText = appState.currentSong.cifra || "";
  const totalShift = (appState.transpose || 0) - (appState.capotraste || 0);
  const isSinger = !!appState.singerMode;

  // 1. Limpeza de caracteres invisíveis e padronização de quebras de linha
  const cleanText = cifraText
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = cleanText.split("\n");
  const processedLines = [];

  // Primeiro passo: normalizar e desdobrar linhas
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Marcador de seção com acordes opcionais na mesma linha: ex: [Intro] C ou [Intro]
    const sectionMatch = trimmed.match(/^(\[[A-Za-zÀ-ÿ0-9\s\-_:]+\])\s*(.*)$/);
    if (sectionMatch) {
      const secMarker = sectionMatch[1];
      const rest = sectionMatch[2].trim();
      if (!rest) {
        processedLines.push({ type: "section", content: secMarker });
      } else {
        processedLines.push({ type: "section-with-chords", section: secMarker, chords: rest });
      }
      continue;
    }

    // Tablatura
    if (/^\s*[eEaAdDgGbB1-6]\|/.test(line)) {
      processedLines.push({ type: "tab", content: line });
      continue;
    }

    // Linha vazia
    if (!trimmed) {
      processedLines.push({ type: "empty", content: "" });
      continue;
    }

    // Linha com colchetes inline [C]Letra
    if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
      const cleanLine = line.replace(/\[\s*\]/g, "");
      const withoutBrackets = cleanLine.replace(/\[[^\]]+\]/g, "");
      if (!withoutBrackets.trim()) {
        const chordOnly = cleanLine.replace(/\[([^\]]+)\]/g, "$1 ").replace(/\s+/g, " ").trim();
        processedLines.push({ type: "chord", content: chordOnly });
        continue;
      }

      const { chordLine, lyricLine } = inlineToTwoLines(cleanLine);
      if (chordLine.trim()) {
        processedLines.push({ type: "chord", content: chordLine });
      }
      if (lyricLine.trim()) {
        processedLines.push({ type: "lyric", content: lyricLine });
      }
      continue;
    }

    // Linha tradicional: acorde sobre letra (estilo Cifra Club) ou letra pura
    if (isChordLine(line)) {
      processedLines.push({ type: "chord", content: line });
    } else {
      processedLines.push({ type: "lyric", content: line });
    }
  }

  // Segundo passo: construir HTML linha por linha preservando alinhamento estrito
  const output = [];

  for (const item of processedLines) {
    if (item.type === "empty") {
      output.push("");
      continue;
    }

    if (item.type === "section") {
      output.push('<span class="cifra-section">' + escapeHtml(item.content) + '</span>');
      continue;
    }

    if (item.type === "section-with-chords") {
      let secHtml = '<span class="cifra-section">' + escapeHtml(item.section) + '</span>';
      if (!isSinger && item.chords) {
        secHtml += " " + formatChordLine(item.chords, totalShift);
      }
      output.push(secHtml);
      continue;
    }

    if (item.type === "tab") {
      if (!isSinger) {
        output.push('<span class="cifra-tablature">' + escapeHtml(item.content) + '</span>');
      }
      continue;
    }

    if (item.type === "chord") {
      if (!isSinger) {
        output.push(formatChordLine(item.content, totalShift));
      }
      continue;
    }

    if (item.type === "lyric") {
      output.push(escapeHtml(item.content));
      continue;
    }
  }

  container.className = "cifra-sheet" + (isSinger ? " singer-mode" : "");
  const fullHtml = output.join("\n");
  container.innerHTML = isSinger ? fullHtml.replace(/\n{3,}/g, "\n\n") : fullHtml;
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
    const keyBadge = song.key ? `<span class="song-badge-key">${escapeHtml(song.key)}</span>` : "";
    div.innerHTML = `<div class="song-info"><div class="song-title">${escapeHtml(song.title)}</div><div class="song-artist">${escapeHtml(song.artist || "")}</div></div>${keyBadge}`;
    div.onclick = () => {
      selectSong(index);
    };
    wrapper.appendChild(div);

    if (filteredSetlist && canEditLibrary()) {
      const actionGroup = document.createElement("div");
      actionGroup.className = "song-item-actions";
      actionGroup.style.cssText = "display: flex; gap: 4px; align-items: center;";

      const songIdxInSetlist = filteredSetlist.songs.indexOf(song.id);

      if (songIdxInSetlist > 0) {
        const upBtn = document.createElement("button");
        upBtn.className = "setlist-reorder-btn";
        upBtn.textContent = "▲";
        upBtn.title = "Mover para cima";
        upBtn.onclick = (e) => {
          e.stopPropagation();
          void moveSongInSetlist(filteredSetlist.id, song.id, -1);
        };
        actionGroup.appendChild(upBtn);
      }

      if (songIdxInSetlist >= 0 && songIdxInSetlist < filteredSetlist.songs.length - 1) {
        const downBtn = document.createElement("button");
        downBtn.className = "setlist-reorder-btn";
        downBtn.textContent = "▼";
        downBtn.title = "Mover para baixo";
        downBtn.onclick = (e) => {
          e.stopPropagation();
          void moveSongInSetlist(filteredSetlist.id, song.id, 1);
        };
        actionGroup.appendChild(downBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "song-item-remove";
      removeBtn.textContent = "X";
      removeBtn.title = "Remover desta setlist";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        const newSongs = filteredSetlist.songs.filter((sid) => sid !== song.id);
        void window.CifraHubApi.request(`/api/bands/${activeBandId()}/playlists/${filteredSetlist.id}`, {
          method: "PUT",
          body: { name: filteredSetlist.name, songs: newSongs },
        });
        filteredSetlist.songs = newSongs;
        renderSongs();
        sendMessage({
          type: "updateSetlist",
          setlist: {
            id: filteredSetlist.id,
            name: filteredSetlist.name,
            songs: newSongs,
          },
        });
        showToast("Música removida da setlist.");
      };
      actionGroup.appendChild(removeBtn);
      wrapper.appendChild(actionGroup);
    }

    list.appendChild(wrapper);
  });
}

function renderSetlists() {
  const list = document.getElementById("setlistsList");
  if (!list) return;
  list.innerHTML = "";
  const createButton = document.getElementById("createSetlistButton");
  if (createButton) createButton.hidden = !canEditLibrary();

  if (appState.setlists.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style.cssText = "color: var(--text-muted); font-size: 13px; text-align: center; padding: 16px 8px; line-height: 1.5;";
    emptyDiv.textContent = "Nenhum setlist. Crie o primeiro para o seu culto ou show.";
    list.appendChild(emptyDiv);
    return;
  }

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
    editBtn.textContent = "Editar";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (canEditLibrary()) {
        showEditSetlistModal(setlist.id);
      } else {
        showToast("Seu papel não permite editar este repertório.");
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
        showToast("Seu papel não permite editar este repertório.");
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
    const origKey = appState.currentSong.key || "C";
    const currentKey = totalShift !== 0 ? transposeChord(origKey, totalShift) : origKey;
    const shiftLabel = totalShift !== 0 ? ` (${totalShift > 0 ? "+" : ""}${totalShift})` : "";
    const keyDisplay = `${currentKey}${shiftLabel}`;
    const artist = appState.currentSong.artist ? `${appState.currentSong.artist} • ` : "";
    const tempo = appState.currentSong.tempo ? ` • ${appState.currentSong.tempo} BPM` : "";
    const meta = document.getElementById("currentSongMeta");
    meta.textContent = `${artist}Tom: ${keyDisplay}${tempo}`;

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

  if (appState.singerMode) {
    container.classList.add("singer-mode");
  } else {
    container.classList.remove("singer-mode");
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
    singerBtn.textContent = appState.singerMode ? " Cifra" : " Cantor";
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
    document.getElementById("roleDisplay").textContent = "LÍDER ";
  } else {
    document.getElementById("hostBadge").style.display = "none";
    document.getElementById("viewerBadge").style.display = "block";
    document.getElementById("roleDisplay").textContent = "VIEWER ";
  }

  const activeList = getActiveSongList();
  const currentPos = appState.currentSong
    ? activeList.findIndex((s) => s.id === appState.currentSong.id)
    : -1;
  const canPrev = currentPos > 0;
  const canNext = currentPos >= 0 && currentPos < activeList.length - 1;
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

  // Sliders ficam livres para uso do usuario
  document.getElementById("transposeSlider").disabled = false;
  document.getElementById("capoSlider").disabled = false;
  document.getElementById("scrollSlider").disabled = false;
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
  title.textContent = "Nova Setlist";
  document.getElementById("newSetlistName").value = "";
  const checkboxDiv = document.getElementById("setlistSongsCheckbox");
  checkboxDiv.innerHTML = "";

  if (!appState.songs || appState.songs.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = "color: var(--text-muted); font-size: 13px; text-align: center; padding: 14px 8px; line-height: 1.5;";
    emptyMsg.innerHTML = " Nenhuma música cadastrada no repertório.<br><small>Adicione músicas ao repertório da banda antes de criar uma setlist.</small>";
    checkboxDiv.appendChild(emptyMsg);
  } else {
    appState.songs.forEach((song) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; min-height: 48px; margin-bottom: 8px; cursor: pointer; color: var(--text-primary); font-size: 14px; background: white; border: 1px solid var(--border-light); border-radius: 10px; transition: all 0.15s ease;";
      
      const leftSpan = document.createElement("span");
      leftSpan.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = song.id;

      const textSpan = document.createElement("span");
      textSpan.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;";
      textSpan.textContent = `${song.title}${song.artist ? ` - ${song.artist}` : ""}`;

      leftSpan.append(input, textSpan);
      label.appendChild(leftSpan);

      if (song.key) {
        const keyTag = document.createElement("span");
        keyTag.className = "song-badge-key";
        keyTag.textContent = song.key;
        label.appendChild(keyTag);
      }

      checkboxDiv.appendChild(label);
    });
  }

  document.getElementById("createSetlistModal").classList.add("active");
}

function showEditSetlistModal(id) {
  if (!canEditLibrary()) return;
  const setlist = appState.setlists.find((s) => s.id === id);
  if (!setlist) return;

  appState.editingSetlist = setlist;
  const title = document.getElementById("createSetlistModal").querySelector(".modal-title");
  title.textContent = "Editar Setlist";
  document.getElementById("newSetlistName").value = setlist.name;
  const checkboxDiv = document.getElementById("setlistSongsCheckbox");
  checkboxDiv.innerHTML = "";

  if (!appState.songs || appState.songs.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = "color: var(--text-muted); font-size: 13px; text-align: center; padding: 14px 8px; line-height: 1.5;";
    emptyMsg.innerHTML = " Nenhuma música cadastrada no repertório.";
    checkboxDiv.appendChild(emptyMsg);
  } else {
    appState.songs.forEach((song) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; min-height: 48px; margin-bottom: 8px; cursor: pointer; color: var(--text-primary); font-size: 14px; background: white; border: 1px solid var(--border-light); border-radius: 10px; transition: all 0.15s ease;";
      
      const leftSpan = document.createElement("span");
      leftSpan.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = song.id;
      input.checked = setlist.songs.includes(song.id);

      const textSpan = document.createElement("span");
      textSpan.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;";
      textSpan.textContent = `${song.title}${song.artist ? ` - ${song.artist}` : ""}`;

      leftSpan.append(input, textSpan);
      label.appendChild(leftSpan);

      if (song.key) {
        const keyTag = document.createElement("span");
        keyTag.className = "song-badge-key";
        keyTag.textContent = song.key;
        label.appendChild(keyTag);
      }

      checkboxDiv.appendChild(label);
    });
  }

  document.getElementById("createSetlistModal").classList.add("active");
}


function showMusiciansModal() {
  renderMusiciansModal();
  document.getElementById("musiciansModal")?.classList.add("active");
}

function transferHostTo(targetClientId) {
  if (!targetClientId) return;
  if (!confirm("Deseja realmente passar o controle do palco (Host) para este integrante?")) return;
  sendMessage({
    type: "transferHost",
    targetClientId,
  });
}

function claimHostBack() {
  if (!confirm("Deseja reassumir o controle do palco (Host)?")) return;
  sendMessage({
    type: "claimHost",
  });
}

function renderMusiciansModal() {
  const list = document.getElementById("musiciansList");
  if (!list) return;
  list.innerHTML = "";

  const activeBand = window.CifraHubContext?.activeBand;
  const isAdmin = activeBand?.role === "ADMIN";
  const canPassHost = appState.isHost || isAdmin;

  const claimBanner = document.getElementById("claimHostBanner");
  if (claimBanner) {
    claimBanner.style.display = (isAdmin && !appState.isHost) ? "block" : "none";
  }

  const clients = appState.connectedClients || [];
  if (clients.length === 0) {
    list.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 14px;">Nenhum integrante conectado no momento.</div>`;
    return;
  }

  clients.forEach((client) => {
    const isMe = client.clientId === appState.clientId;
    const card = document.createElement("div");
    card.className = "musician-card" + (isMe ? " is-current" : "");

    const info = document.createElement("div");
    info.className = "musician-info";

    const icon = document.createElement("div");
    icon.className = "musician-icon";
    icon.textContent = client.isHost ? "" : (client.isAnonymous ? "" : "");

    const details = document.createElement("div");
    details.style.cssText = "min-width: 0; flex: 1;";

    const nameRow = document.createElement("div");
    nameRow.className = "musician-name";
    nameRow.textContent = `${client.deviceName || "Dispositivo"}${isMe ? " (Você)" : ""}`;

    const roleRow = document.createElement("div");
    roleRow.style.cssText = "display: flex; gap: 6px; align-items: center; margin-top: 2px;";

    const roleTag = document.createElement("span");
    roleTag.className = `musician-role-tag ${client.isHost ? "host" : "viewer"}`;
    roleTag.textContent = client.isHost ? "Líder (Host)" : (client.role === "ADMIN" ? "Admin" : "Músico");
    roleRow.appendChild(roleTag);

    details.append(nameRow, roleRow);
    info.append(icon, details);
    card.appendChild(info);

    if (canPassHost && !client.isHost && !isMe) {
      const btnPass = document.createElement("button");
      btnPass.type = "button";
      btnPass.className = "btn-transfer-host";
      btnPass.textContent = "Passar Host";
      btnPass.onclick = () => transferHostTo(client.clientId);
      card.appendChild(btnPass);
    }

    list.appendChild(card);
  });
}


async function importCifraFromUrl(mode = "create") {
  const isEdit = mode === "edit";
  const urlInput = document.getElementById(isEdit ? "editCifraClubUrlInput" : "cifraClubUrlInput");
  const url = (urlInput?.value || "").trim();

  if (!url) {
    showToast("Cole o link da música no Cifra Club.");
    return;
  }

  if (!url.includes("cifraclub.com")) {
    showToast("O link deve ser do Cifra Club (ex: https://www.cifraclub.com.br/...).");
    return;
  }

  const btn = isEdit ? document.getElementById("editImportCifraClubBtn") : document.getElementById("importCifraClubBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Importando...";
  }

  try {
    const result = await window.CifraHubApi.request("/api/import-cifra", {
      method: "POST",
      body: { url },
    });

    const data = result.data || result;
    if (isEdit) {
      if (data.title) document.getElementById("editSongTitle").value = data.title;
      if (data.artist) document.getElementById("editSongArtist").value = data.artist;
      if (data.key) document.getElementById("editSongKey").value = data.key;
      if (data.tempo) document.getElementById("editSongTempo").value = data.tempo;
      if (data.cifra) document.getElementById("editSongCifra").value = data.cifra;
    } else {
      if (data.title) document.getElementById("newSongTitle").value = data.title;
      if (data.artist) document.getElementById("newSongArtist").value = data.artist;
      if (data.key) document.getElementById("newSongKey").value = data.key;
      if (data.tempo) document.getElementById("newSongTempo").value = data.tempo;
      if (data.cifra) document.getElementById("newSongCifra").value = data.cifra;
    }

    showToast("Cifra importada com sucesso. Revise antes de salvar.");
  } catch (error) {
    showToast(error.message || "Falha ao importar do Cifra Club. Cole o texto manualmente.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Importar Link";
    }
  }
}

function confirmSignOut() {
  if (confirm("Deseja realmente sair da sua conta?")) {
    if (window.signOut) {
      window.signOut();
    } else {
      document.getElementById("logoutButton")?.click();
    }
  }
}

async function moveSongInSetlist(setlistId, songId, direction) {
  const setlist = appState.setlists.find((s) => s.id === setlistId);
  if (!setlist) return;
  const idx = setlist.songs.indexOf(songId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= setlist.songs.length) return;

  const newSongs = [...setlist.songs];
  const [removed] = newSongs.splice(idx, 1);
  newSongs.splice(targetIdx, 0, removed);

  try {
    await window.CifraHubApi.request(`/api/bands/${activeBandId()}/playlists/${setlist.id}`, {
      method: "PUT",
      body: { name: setlist.name, songs: newSongs },
    });
    setlist.songs = newSongs;
    renderSongs();
    if (appState.ws && appState.ws.readyState === 1) {
      sendMessage({
        type: "updateSetlist",
        setlist: { id: setlist.id, name: setlist.name, songs: newSongs },
      });
    }
    showToast("Ordem da setlist atualizada.");
  } catch (error) {
    showToast(error.message);
  }
}

function showSettingsModal() {
  document.getElementById("deviceNameInput").value = appState.deviceName;
  document.getElementById("clientIdDisplay").value = appState.clientId;
  document.getElementById("serverAddress").textContent = window.location.hostname;
  document.getElementById("serverStatus").textContent =
    appState.ws?.readyState === 1 ? " Conectado" : " Desconectado";
  document.getElementById("settingsModal").classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

// ═══════════════════════════ ADICIONAR MÚSICAS À SETLIST ═══════════════════════════
function showAddToSetlistModal() {
  if (!canEditLibrary()) {
    showToast("Seu papel não permite editar este repertório.");
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
    showToast(" Selecione pelo menos uma música");
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
    showToast(" Selecione uma música primeiro");
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
    showToast("Arquivo importado com sucesso.");
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

let isCreatingSong = false;

async function createSong(e) {
  if (e) e.preventDefault();
  if (isCreatingSong) return;
  if (!canEditLibrary()) return;

  const titleInput = document.getElementById("newSongTitle");
  const artistInput = document.getElementById("newSongArtist");
  const keyInput = document.getElementById("newSongKey");
  const tempoInput = document.getElementById("newSongTempo");
  const cifraInput = document.getElementById("newSongCifra");
  const saveBtn = document.getElementById("saveNewSongBtn");

  const title = (titleInput?.value || "").trim();
  const artist = (artistInput?.value || "").trim();
  const key = keyInput?.value || "C";
  const tempo = parseInt(tempoInput?.value, 10) || 120;
  let cifra = cifraInput?.value || "";

  if (!title) {
    showToast("Por favor, preencha o título da música.");
    return;
  }

  if (window.normalizarCifra) {
    cifra = window.normalizarCifra(cifra);
  }

  isCreatingSong = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Criando...";
  }

  const clientSongId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : undefined;

  try {
    const result = await window.CifraHubApi.request(`/api/bands/${activeBandId()}/songs`, {
      method: "POST",
      body: { id: clientSongId, title, artist, key, tempo, cifra },
    });
    const createdSong = result.data ?? result;

    const existingIdx = appState.songs.findIndex((s) => s.id === createdSong.id);
    if (existingIdx !== -1) {
      appState.songs[existingIdx] = createdSong;
    } else {
      appState.songs.push(createdSong);
    }

    renderSongs();
    closeModal("createSongModal");
    document.getElementById("createSongForm")?.reset();
    showToast("Música criada com sucesso.");

    const newIdx = appState.songs.findIndex((s) => s.id === createdSong.id);
    if (newIdx !== -1) {
      selectSong(newIdx);
    }
  } catch (error) {
    showToast(error.message || "Falha ao criar música.");
  } finally {
    isCreatingSong = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Criar Música";
    }
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
    showToast("O nome da setlist não pode ser vazio.");
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
  selectSong,
  selectSetlist,
  deleteSetlist,
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
  importCifraFromUrl,
  confirmSignOut,
  moveSongInSetlist,
  showMusiciansModal,
  transferHostTo,
  claimHostBack,
  createSong,
  handleTxtImport,
  closeModal,
  updateSong,
  confirmAddToSetlist,
  createSetlist,
});

// Inicia a interface e verifica a conta antes de abrir qualquer sala.
init();

// Fechar modais ao clicar no fundo
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".modal").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.remove("active");
    });
  });
});
