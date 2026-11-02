/* Cliente HTTP compartilhado com autenticação Bearer e tratamento de sessão expirada. */
(() => {
  const tokenKey = "cifrahub_token";

  async function request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    const token = localStorage.getItem(tokenKey);
    if (token && options.public !== true) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");

    const response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.status === 401 && token && options.public !== true)
      window.CifraHubAuth?.expireSession();
    if (!response.ok) {
      const error = new Error(
        data?.error?.message ?? data?.error ?? "Não foi possível concluir a solicitação.",
      );
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  }

  window.CifraHubApi = Object.freeze({ request, tokenKey });
})();
