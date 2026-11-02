/* Abre salas isoladas, sincroniza mensagens e tenta reconectar ao palco. */
(() => {
  const retryDelayMs = 3000;

  function buildUrl(context) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${scheme}//${window.location.host}`);
    if (context.sessionId) url.searchParams.set("sessionId", context.sessionId);
    else if (context.code) url.searchParams.set("code", context.code);
    if (context.token) url.searchParams.set("token", context.token);
    return url.toString();
  }

  function connect(context, handlers) {
    let stopped = false;
    let retryTimer = null;
    let socket = null;

    function open() {
      if (stopped) return;
      try {
        socket = new WebSocket(buildUrl(context));
        handlers.onSocket(socket);
        socket.addEventListener("open", () => handlers.onOpen(socket));
        socket.addEventListener("message", (event) => handlers.onMessage(event.data));
        socket.addEventListener("error", (event) => handlers.onError(event));
        socket.addEventListener("close", (event) => {
          handlers.onClose(event);
          if (!stopped && event.code !== 1008) retryTimer = window.setTimeout(open, retryDelayMs);
        });
      } catch (error) {
        handlers.onError(error);
        if (!stopped) retryTimer = window.setTimeout(open, retryDelayMs);
      }
    }

    open();
    return {
      stop() {
        stopped = true;
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Sessão encerrada");
      },
    };
  }

  window.CifraHubWebSocket = Object.freeze({ connect });
})();
