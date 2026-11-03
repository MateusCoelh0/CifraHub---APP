/* Gerencia entrada, cadastro, sessão autenticada e acesso temporário de convidado. */
(() => {
  const context = (window.CifraHubContext = window.CifraHubContext ?? {});
  let initialized = false;

  function showMessage(message = "") {
    document.getElementById("authMessage").textContent = message;
  }

  function switchMode(mode) {
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const selected = button.dataset.authMode === mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.authPanel !== mode;
    });
    showMessage();
  }

  function dismissGate() {
    document.getElementById("authGate").classList.add("is-dismissed");
    document.body.classList.remove("auth-locked");
  }

  async function finishAuthentication(token, user) {
    localStorage.setItem(window.CifraHubApi.tokenKey, token);
    context.token = token;
    context.user = user;
    const profile = await window.CifraHubApi.request("/api/auth/me");
    context.user = profile.user;
    dismissGate();
    await window.CifraHubBands.initialize(profile);
  }

  async function submitAuthentication(event, mode) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    showMessage("Conectando com segurança…");
    try {
      const result = await window.CifraHubApi.request(endpoint, {
        method: "POST",
        body: payload,
        public: true,
      });
      await finishAuthentication(result.token, result.user);
    } catch (error) {
      showMessage(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function enterAsGuest(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const code = String(payload.code ?? "").trim();
    const nickname = String(payload.name ?? "").trim();
    if (!/^\d{6}$/.test(code) || !nickname) {
      showMessage("Informe o código de seis dígitos e um apelido.");
      return;
    }
    context.token = null;
    context.user = null;
    context.guestCode = code;
    context.nickname = nickname;
    dismissGate();
    window.CifraHubApp.startGuest(code, nickname);
  }

  function signOut() {
    if (!confirm("Deseja realmente sair da sua conta?")) return;
    localStorage.removeItem(window.CifraHubApi.tokenKey);
    context.token = null;
    context.user = null;
    context.guestCode = null;
    context.nickname = null;
    window.CifraHubBands.reset();
    window.CifraHubApp.disconnect();
    document.querySelectorAll(".modal.active").forEach((m) => m.classList.remove("active"));
    document.getElementById("workspacePanel").hidden = true;
    document.getElementById("container").classList.remove("stage-mode", "viewer-mode");
    document.body.classList.add("auth-locked");
    document.getElementById("authGate").classList.remove("is-dismissed");
    switchMode("login");
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("code") ?? "";
    if (/^\d{6}$/.test(inviteCode)) {
      document.getElementById("guestCode").value = inviteCode;
      switchMode("guest");
    }
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => switchMode(button.dataset.authMode));
    });
    document
      .getElementById("authLoginForm")
      .addEventListener("submit", (event) => void submitAuthentication(event, "login"));
    document
      .getElementById("authRegisterForm")
      .addEventListener("submit", (event) => void submitAuthentication(event, "register"));
    document.getElementById("authGuestForm").addEventListener("submit", enterAsGuest);
    document.getElementById("logoutButton").addEventListener("click", signOut);

    const token = localStorage.getItem(window.CifraHubApi.tokenKey);
    if (!token) return;
    context.token = token;
    try {
      const profile = await window.CifraHubApi.request("/api/auth/me");
      context.user = profile.user;
      dismissGate();
      await window.CifraHubBands.initialize(profile);
      if (/^\d{6}$/.test(inviteCode)) await window.CifraHubBands.joinCode(inviteCode);
    } catch {
      localStorage.removeItem(window.CifraHubApi.tokenKey);
      context.token = null;
      document.body.classList.add("auth-locked");
      document.getElementById("authGate").classList.remove("is-dismissed");
    }
  }

  function expireSession() {
    if (!localStorage.getItem(window.CifraHubApi.tokenKey)) return;
    signOut();
    showMessage("Sua sessão expirou. Entre novamente para continuar.");
  }

  window.CifraHubAuth = Object.freeze({ initialize, expireSession, signOut });
  document.body.classList.add("auth-locked");
})();
