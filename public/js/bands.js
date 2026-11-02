/* Cuida da banda ativa, do repertório e da sessão única de palco do usuário. */
(() => {
  const context = (window.CifraHubContext = window.CifraHubContext ?? {});
  const state = { bands: [], activeBand: null, session: null };
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
    if (!select) return;
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

    const bandSelector = document.getElementById("bandSelector");
    if (bandSelector) {
      bandSelector.addEventListener("change", (event) => {
        void selectBand(event.currentTarget.value);
      });
    }

    const createBandBtn = document.getElementById("createBandButton");
    if (createBandBtn) {
      createBandBtn.addEventListener("click", () => void createBand());
    }

    const copyBtn = document.getElementById("copySessionLinkButton");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => void copyInvite());
    }
  }

  async function initialize(profile) {
    bindControls();
    context.user = profile.user;
    const nameEl = document.getElementById("currentUserName");
    if (nameEl) {
      nameEl.textContent = profile.user.displayName ?? profile.user.name;
    }
    const panel = document.getElementById("workspacePanel");
    if (panel) panel.hidden = false;

    state.bands = profile.bands ?? [];
    if (!state.bands.length) {
      state.activeBand = null;
      state.session = null;
      const roleBadge = document.getElementById("bandRoleBadge");
      if (roleBadge) roleBadge.hidden = true;
      setOptions(document.getElementById("bandSelector"), [], "Crie sua primeira banda");
      await window.CifraHubApp.setLibrary([], []);
      showSessionCode("");
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
    state.session = null;
    context.activeBand = band;
    localStorage.setItem("cifrahub_bandId", band.id);

    const bandSelector = document.getElementById("bandSelector");
    setOptions(
      bandSelector,
      state.bands.map((item) => ({ label: item.name, value: item.id })),
      "Selecione uma banda",
      band.id,
    );

    const roleEl = document.getElementById("roleDisplay");
    if (roleEl) roleEl.textContent = band.role ?? "MEMBER";
    const roleBadge = document.getElementById("bandRoleBadge");
    if (roleBadge) {
      roleBadge.textContent = band.role ?? "MEMBER";
      roleBadge.hidden = false;
    }

    window.CifraHubApp.disconnect();

    try {
      // 1. Carregar Repertório e Setlists da banda
      const [songsResult, playlistsResult] = await Promise.all([
        window.CifraHubApi.request(`/api/bands/${band.id}/songs`),
        window.CifraHubApi.request(`/api/bands/${band.id}/playlists`),
      ]);

      await window.CifraHubApp.setLibrary(songsResult.data ?? [], playlistsResult.data ?? []);

      // 2. Singleton Session: Obter ou criar a sessão fixa da banda
      let session = null;
      const sessionsResult = await window.CifraHubApi.request(`/api/bands/${band.id}/sessions`);
      const existingSessions = sessionsResult.data ?? [];

      if (existingSessions.length > 0) {
        session = existingSessions[0];
      } else if (band.role !== "VIEWER") {
        // Criar a sessão única para a banda
        session = await window.CifraHubApi.request(`/api/bands/${band.id}/sessions`, {
          method: "POST",
          body: {},
        });
      }

      if (session) {
        state.session = session;
        showSessionCode(session.code);
        window.CifraHubApp.startAuthenticatedSession(session, band);
      } else {
        showSessionCode("");
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

  function showSessionCode(code) {
    const card = document.getElementById("sessionCodeCard");
    if (card) card.hidden = !code;
    const label = document.getElementById("sessionCodeLabel");
    if (label) label.textContent = code || "------";
  }

  async function copyInvite() {
    const label = document.getElementById("sessionCodeLabel");
    const code = label ? label.textContent.trim() : "";
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
    state.session = null;
    context.activeBand = null;
  }

  window.CifraHubBands = Object.freeze({ initialize, selectBand, reset, state });
})();
