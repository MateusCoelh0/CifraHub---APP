/* Cuida da banda ativa, do repertório e das salas de palco do usuário. */
(() => {
  const context = (window.CifraHubContext = window.CifraHubContext ?? {});
  const state = { bands: [], activeBand: null, sessions: [], activeSession: null };
  let bound = false;

  function showFeedback(message, kind = "success") {
    if (
      document.getElementById("authGate").classList.contains("is-dismissed") &&
      window.showToast
    ) {
      window.showToast(message);
      return;
    }
    const output = document.getElementById("authMessage");
    if (!output) return;
    output.textContent = message;
    output.dataset.kind = kind;
  }

  function setOptions(select, items, placeholder, selectedValue = "") {
    select.replaceChildren(new Option(placeholder, ""));
    for (const item of items) {
      const option = new Option(item.label, item.value);
      if (item.value === selectedValue) option.selected = true;
      select.add(option);
    }
  }

  function bindControls() {
    if (bound) return;
    bound = true;
    document.getElementById("bandSelector").addEventListener("change", (event) => {
      void selectBand(event.currentTarget.value);
    });
    document.getElementById("sessionSelector").addEventListener("change", (event) => {
      const selected = state.sessions.find((session) => session.id === event.currentTarget.value);
      state.activeSession = selected ?? null;
      showSessionCode(selected?.code ?? "");
    });
    document
      .getElementById("startSessionButton")
      .addEventListener("click", () => void startSession());
    document
      .getElementById("joinSessionButton")
      .addEventListener("click", () => void joinSelectedSession());
    document.getElementById("createBandButton").addEventListener("click", () => void createBand());
    document
      .getElementById("copySessionLinkButton")
      .addEventListener("click", () => void copyInvite());
  }

  async function initialize(profile) {
    bindControls();
    context.user = profile.user;
    document.getElementById("currentUserName").textContent =
      profile.user.displayName ?? profile.user.name;
    document.getElementById("workspacePanel").hidden = false;
    state.bands = profile.bands ?? [];
    if (!state.bands.length) {
      state.activeBand = null;
      document.getElementById("bandRoleBadge").hidden = true;
      document.getElementById("startSessionButton").disabled = true;
      document.getElementById("joinSessionButton").disabled = true;
      setOptions(document.getElementById("bandSelector"), [], "Crie sua primeira banda");
      await window.CifraHubApp.setLibrary([], []);
      showFeedback("Crie uma banda para começar a montar o repertório.");
      return;
    }
    const preferredBand = localStorage.getItem("cifrahub_bandId");
    const selected = state.bands.find((band) => band.id === preferredBand) ?? state.bands[0];
    await selectBand(selected.id);
  }

  async function selectBand(bandId) {
    if (!bandId) return;
    const band = state.bands.find((item) => item.id === bandId);
    if (!band) return;
    state.activeBand = band;
    state.activeSession = null;
    context.activeBand = band;
    localStorage.setItem("cifrahub_bandId", band.id);
    const bandSelector = document.getElementById("bandSelector");
    setOptions(
      bandSelector,
      state.bands.map((item) => ({ label: item.name, value: item.id })),
      "Selecione uma banda",
      band.id,
    );
    document.getElementById("roleDisplay").textContent = band.role ?? "MEMBER";
    document.getElementById("bandRoleBadge").textContent = band.role ?? "MEMBER";
    document.getElementById("bandRoleBadge").hidden = false;
    document.getElementById("startSessionButton").disabled = band.role === "VIEWER";
    window.CifraHubApp.disconnect();
    try {
      const [songsResult, playlistsResult, sessionsResult] = await Promise.all([
        window.CifraHubApi.request(`/api/bands/${band.id}/songs`),
        window.CifraHubApi.request(`/api/bands/${band.id}/playlists`),
        window.CifraHubApi.request(`/api/bands/${band.id}/sessions`),
      ]);
      state.sessions = sessionsResult.data ?? [];
      setOptions(
        document.getElementById("sessionSelector"),
        state.sessions.map((session) => ({
          label: `${session.code} · ${session.connectedDevices} conectados`,
          value: session.id,
        })),
        state.sessions.length ? "Escolha uma sessão ativa" : "Nenhuma sessão ativa",
      );
      document.getElementById("joinSessionButton").disabled = state.sessions.length === 0;
      await window.CifraHubApp.setLibrary(songsResult.data ?? [], playlistsResult.data ?? []);
      showSessionCode("");
      // Auto-conectar: entrar numa sessão existente ou criar uma nova
      if (state.sessions.length > 0) {
        const session = state.sessions[0];
        state.activeSession = session;
        document.getElementById("sessionSelector").value = session.id;
        showSessionCode(session.code);
        window.CifraHubApp.startAuthenticatedSession(session, band);
      } else if (band.role !== "VIEWER") {
        await startSession();
      }
    } catch (error) {
      showFeedback(error.message, "error");
    }
  }

  async function createBand() {
    const name = window.prompt("Qual é o nome da nova banda?")?.trim();
    if (!name) return;
    try {
      const result = await window.CifraHubApi.request("/api/bands", {
        method: "POST",
        body: { name },
      });
      const createdBand = { ...result.data, role: "ADMIN" };
      state.bands.push(createdBand);
      await selectBand(createdBand.id);
      showFeedback(`Banda “${createdBand.name}” criada.`);
    } catch (error) {
      showFeedback(error.message, "error");
    }
  }

  async function startSession() {
    if (!state.activeBand || state.activeBand.role === "VIEWER") return;
    try {
      const session = await window.CifraHubApi.request(
        `/api/bands/${state.activeBand.id}/sessions`,
        { method: "POST", body: {} },
      );
      state.activeSession = session;
      showSessionCode(session.code);
      window.CifraHubApp.startAuthenticatedSession(session, state.activeBand);
      await refreshSessions(session.id);
      showFeedback("Sessão iniciada. Compartilhe o código com a banda.");
    } catch (error) {
      showFeedback(error.message, "error");
    }
  }

  async function refreshSessions(selectedId = "") {
    if (!state.activeBand) return;
    const result = await window.CifraHubApi.request(`/api/bands/${state.activeBand.id}/sessions`);
    state.sessions = result.data ?? [];
    setOptions(
      document.getElementById("sessionSelector"),
      state.sessions.map((session) => ({
        label: `${session.code} · ${session.connectedDevices} conectados`,
        value: session.id,
      })),
      state.sessions.length ? "Escolha uma sessão ativa" : "Nenhuma sessão ativa",
      selectedId,
    );
    document.getElementById("joinSessionButton").disabled = state.sessions.length === 0;
    state.activeSession =
      state.sessions.find((session) => session.id === selectedId) ?? state.activeSession;
  }

  async function joinSelectedSession() {
    const sessionId = document.getElementById("sessionSelector").value;
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      showFeedback("Selecione uma sessão ao vivo para conectar.", "error");
      return;
    }
    state.activeSession = session;
    showSessionCode(session.code);
    window.CifraHubApp.startAuthenticatedSession(session, state.activeBand);
  }

  async function joinCode(code) {
    const knownSession = state.sessions.find((session) => session.code === code);
    if (knownSession) {
      state.activeSession = knownSession;
      showSessionCode(code);
      window.CifraHubApp.startAuthenticatedSession(knownSession, state.activeBand);
      return;
    }
    window.CifraHubApp.startAuthenticatedSession({ code }, state.activeBand);
  }

  function showSessionCode(code) {
    const card = document.getElementById("sessionCodeCard");
    card.hidden = !code;
    document.getElementById("sessionCodeLabel").textContent = code || "------";
  }

  async function copyInvite() {
    const code = document.getElementById("sessionCodeLabel").textContent;
    if (!/^\d{6}$/.test(code)) return;
    const link = `${window.location.origin}/?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      showFeedback("Convite copiado para a área de transferência.");
    } catch {
      window.prompt("Copie este link de convite:", link);
    }
  }

  function reset() {
    state.bands = [];
    state.activeBand = null;
    state.sessions = [];
    state.activeSession = null;
    context.activeBand = null;
  }

  window.CifraHubBands = Object.freeze({ initialize, selectBand, joinCode, reset, state });
})();
