/* Adiciona gestos de palco, gaveta móvel, ajuste de fonte e tela sempre ativa. */
(() => {
  let wakeLock = null;
  let startPoint = null;

  function vibrate() {
    if ("vibrate" in navigator) navigator.vibrate(20);
  }

  async function updateWakeLock() {
    const state = window.CifraHubApp?.state;
    const shouldStayAwake = state?.stageMode || state?.isAutoScrolling;
    if (!shouldStayAwake) {
      if (wakeLock) await wakeLock.release().catch(() => undefined);
      wakeLock = null;
      return;
    }
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  }

  function adjustFont(amount) {
    const state = window.CifraHubApp.state;
    const property = state.singerMode ? "singerFontSize" : "fontSize";
    state[property] = Math.max(12, Math.min(72, state[property] + amount));
    localStorage.setItem(`cifrahub_${property}`, state[property]);
    const slider = document.getElementById("fontSizeSlider");
    if (slider) slider.value = String(state[property]);
    window.updateUI();
  }

  function setScrollPlayback() {
    const state = window.CifraHubApp.state;
    if (!state.isHost) return;
    const slider = document.getElementById("scrollSlider");
    slider.value = state.isAutoScrolling ? "0" : "25";
    window.updateAutoScroll();
    updateWakeLock();
  }

  function shiftTranspose(amount) {
    const state = window.CifraHubApp.state;
    if (!state.isHost) return;
    const slider = document.getElementById("transposeSlider");
    slider.value = String(Math.max(-12, Math.min(12, state.transpose + amount)));
    window.updateTranspose();
  }

  function toggleLibrarySheet() {
    const sidebar = document.querySelector(".sidebar");
    document.querySelector(".panel-right").classList.remove("controls-sheet-open");
    document.body.classList.remove("controls-sheet-visible");
    sidebar.classList.toggle("sheet-open");
    document.body.classList.toggle("sheet-visible", sidebar.classList.contains("sheet-open"));
  }

  function toggleControlsSheet() {
    const controls = document.querySelector(".panel-right");
    document.querySelector(".sidebar").classList.remove("sheet-open");
    document.body.classList.remove("sheet-visible");
    controls.classList.toggle("controls-sheet-open");
    document.body.classList.toggle(
      "controls-sheet-visible",
      controls.classList.contains("controls-sheet-open"),
    );
  }

  function setupGestures() {
    const stage = document.getElementById("cifraContainer");
    stage.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        startPoint = { x: touch.clientX, y: touch.clientY };
      },
      { passive: true },
    );
    stage.addEventListener(
      "touchend",
      (event) => {
        if (!startPoint) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - startPoint.x;
        const deltaY = touch.clientY - startPoint.y;
        startPoint = null;
        if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
        const state = window.CifraHubApp.state;
        if (!state.isHost || !state.currentSetlist) return;
        if (deltaX < 0) window.nextSong();
        else window.previousSong();
        vibrate();
      },
      { passive: true },
    );
  }

  function setup() {
    document.getElementById("dockLibrary").addEventListener("click", toggleLibrarySheet);
    document.getElementById("dockControls").addEventListener("click", toggleControlsSheet);
    document.getElementById("closeControlsSheet").addEventListener("click", toggleControlsSheet);
    document.getElementById("controlsSheetHandle").addEventListener("click", toggleControlsSheet);
    document.getElementById("dockAutoScroll").addEventListener("click", setScrollPlayback);
    document
      .getElementById("dockTransposeDown")
      .addEventListener("click", () => shiftTranspose(-1));
    document.getElementById("dockTransposeUp").addEventListener("click", () => shiftTranspose(1));
    document
      .getElementById("dockStageMode")
      .addEventListener("click", () => window.toggleStageMode());
    document
      .getElementById("focusRestoreButton")
      .addEventListener("click", () => window.toggleStageMode());
    document.getElementById("fontDecrease").addEventListener("click", () => adjustFont(-2));
    document.getElementById("fontIncrease").addEventListener("click", () => adjustFont(2));
    document.querySelector(".sheet-handle").addEventListener("click", toggleLibrarySheet);
    document.addEventListener("click", (event) => {
      const sidebar = document.querySelector(".sidebar");
      if (
        sidebar.classList.contains("sheet-open") &&
        !event.target.closest(".sidebar, .mobile-dock")
      ) {
        sidebar.classList.remove("sheet-open");
        document.body.classList.remove("sheet-visible");
      }
      const controls = document.querySelector(".panel-right");
      if (
        controls.classList.contains("controls-sheet-open") &&
        !event.target.closest(".panel-right, .mobile-dock")
      ) {
        controls.classList.remove("controls-sheet-open");
        document.body.classList.remove("controls-sheet-visible");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.querySelector(".sidebar").classList.remove("sheet-open");
        document.querySelector(".panel-right").classList.remove("controls-sheet-open");
        document.body.classList.remove("sheet-visible");
        document.body.classList.remove("controls-sheet-visible");
      }
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("button, select, input[type=range]")) vibrate();
    });
    document.addEventListener("visibilitychange", () => void updateWakeLock());
    window.addEventListener("cifrahub:stage-state", () => void updateWakeLock());
    setupGestures();
  }

  window.CifraHubTouch = Object.freeze({ setup, vibrate, updateWakeLock });
})();
