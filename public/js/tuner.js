/**
 * Afinador Digital de Cordas - CifraHub
 * Detecção precisa de pitch por autocorrelação e gerador de tom de referência (Web Audio API)
 */
(() => {
  const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  const INSTRUMENTS = {
    guitar: {
      name: "Violão / Guitarra",
      strings: [
        { note: "E2", freq: 82.41, label: "6ª E" },
        { note: "A2", freq: 110.0, label: "5ª A" },
        { note: "D3", freq: 146.83, label: "4ª D" },
        { note: "G3", freq: 196.0, label: "3ª G" },
        { note: "B3", freq: 246.94, label: "2ª B" },
        { note: "E4", freq: 329.63, label: "1ª E" },
      ],
    },
    bass: {
      name: "Baixo",
      strings: [
        { note: "E1", freq: 41.2, label: "4ª E" },
        { note: "A1", freq: 55.0, label: "3ª A" },
        { note: "D2", freq: 73.42, label: "2ª D" },
        { note: "G2", freq: 98.0, label: "1ª G" },
      ],
    },
    ukulele: {
      name: "Ukulele",
      strings: [
        { note: "G4", freq: 392.0, label: "4ª G" },
        { note: "C4", freq: 261.63, label: "3ª C" },
        { note: "E4", freq: 329.63, label: "2ª E" },
        { note: "A4", freq: 440.0, label: "1ª A" },
      ],
    },
    chromatic: {
      name: "Cromático",
      strings: [],
    },
  };

  let audioCtx = null;
  let analyser = null;
  let mediaStream = null;
  let animationId = null;
  let oscillator = null;
  let gainNode = null;
  let isRunning = false;
  let currentInstrument = "guitar";
  let targetString = null;
  let isTonePlaying = false;

  // Algoritmo de autocorrelação com interpolação parabólica
  function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    // Se o sinal for muito baixo (silêncio ou ruído de fundo sutil), não processar
    if (rms < 0.012) return -1;

    // Normalização com corte de threshold
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const trimmedBuf = buf.slice(r1, r2);
    const c = new Array(trimmedBuf.length).fill(0);
    for (let i = 0; i < trimmedBuf.length; i++) {
      for (let j = 0; j < trimmedBuf.length - i; j++) {
        c[i] = c[i] + trimmedBuf[j] * trimmedBuf[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < trimmedBuf.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    if (T0 <= 0 || T0 >= trimmedBuf.length - 1) return -1;

    // Interpolação parabólica para precisão sub-amostral
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
      T0 = T0 - b / (2 * a);
    }

    return sampleRate / T0;
  }

  function getNoteFromFrequency(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const roundedNote = Math.round(noteNum) + 69;
    const noteName = NOTE_STRINGS[roundedNote % 12];
    const octave = Math.floor(roundedNote / 12) - 1;
    const standardFreq = 440 * Math.pow(2, (roundedNote - 69) / 12);
    const cents = Math.round(1200 * (Math.log(frequency / standardFreq) / Math.log(2)));

    return {
      name: `${noteName}${octave}`,
      noteOnly: noteName,
      octave,
      frequency: standardFreq,
      cents: Math.max(-50, Math.min(50, cents)),
    };
  }

  function updatePitch() {
    if (!isRunning || !analyser) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const freq = autoCorrelate(buffer, audioCtx.sampleRate);

    const noteEl = document.getElementById("tunerNote");
    const freqEl = document.getElementById("tunerFreq");
    const centsEl = document.getElementById("tunerCents");
    const needleEl = document.getElementById("tunerNeedle");

    if (freq !== -1 && freq >= 30 && freq <= 1200) {
      const note = getNoteFromFrequency(freq);
      let centsDiff = note.cents;

      // Se houver uma corda alvo selecionada, comparar com a frequência exata dela
      if (targetString) {
        const targetCents = Math.round(1200 * (Math.log(freq / targetString.freq) / Math.log(2)));
        centsDiff = Math.max(-50, Math.min(50, targetCents));
      }

      if (noteEl) noteEl.textContent = targetString ? targetString.note : note.name;
      if (freqEl) freqEl.textContent = `${freq.toFixed(1)} Hz`;
      if (centsEl) {
        centsEl.textContent = `${centsDiff > 0 ? "+" : ""}${centsDiff} cents`;
      }

      // Atualizar posição da agulha (-50 a +50 cents mapeado em 0% a 100%)
      const needlePercent = 50 + centsDiff;
      if (needleEl) {
        needleEl.style.left = `${Math.max(5, Math.min(95, needlePercent))}%`;
      }

      const inTune = Math.abs(centsDiff) <= 3;
      if (noteEl) {
        if (inTune) {
          noteEl.classList.add("in-tune");
        } else {
          noteEl.classList.remove("in-tune");
        }
      }
      if (centsEl) {
        if (inTune) {
          centsEl.classList.add("in-tune");
        } else {
          centsEl.classList.remove("in-tune");
        }
      }
    }

    animationId = requestAnimationFrame(updatePitch);
  }

  async function startListening() {
    if (isRunning) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const source = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      isRunning = true;
      updatePitch();

      const statusEl = document.getElementById("tunerStatus");
      if (statusEl) statusEl.textContent = "Escutando instrumento...";
    } catch (err) {
      console.warn("Erro ao acessar microfone para o afinador:", err);
      const statusEl = document.getElementById("tunerStatus");
      if (statusEl) statusEl.textContent = "Permissão de microfone necessária.";
    }
  }

  function stopListening() {
    isRunning = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    stopReferenceTone();
    resetDisplay();
  }

  function resetDisplay() {
    const noteEl = document.getElementById("tunerNote");
    const freqEl = document.getElementById("tunerFreq");
    const centsEl = document.getElementById("tunerCents");
    const needleEl = document.getElementById("tunerNeedle");
    const statusEl = document.getElementById("tunerStatus");

    if (noteEl) {
      noteEl.textContent = "--";
      noteEl.classList.remove("in-tune");
    }
    if (freqEl) freqEl.textContent = "-- Hz";
    if (centsEl) {
      centsEl.textContent = "0 cents";
      centsEl.classList.remove("in-tune");
    }
    if (needleEl) needleEl.style.left = "50%";
    if (statusEl) statusEl.textContent = "Toque uma corda no instrumento";
  }

  function playReferenceTone(freq) {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    stopReferenceTone();

    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Fade-in suave para não dar estalo nos alto-falantes
    gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    isTonePlaying = true;
  }

  function stopReferenceTone() {
    if (oscillator && isTonePlaying) {
      try {
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
        setTimeout(() => {
          if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
          }
        }, 60);
      } catch {
        oscillator = null;
      }
      isTonePlaying = false;
    }
  }

  function renderStrings(instrumentKey) {
    const container = document.getElementById("tunerStringsGrid");
    if (!container) return;
    container.innerHTML = "";

    const inst = INSTRUMENTS[instrumentKey];
    if (!inst || !inst.strings.length) {
      container.style.display = "none";
      return;
    }
    container.style.display = "flex";

    inst.strings.forEach((str) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tuner-string-btn" + (targetString?.note === str.note ? " active" : "");
      btn.innerHTML = `<span style="font-size: 13px;">${str.note}</span><span style="font-size: 9px; opacity: 0.7;">${str.label}</span>`;
      btn.onclick = () => {
        if (targetString?.note === str.note) {
          targetString = null;
          btn.classList.remove("active");
          stopReferenceTone();
        } else {
          targetString = str;
          container.querySelectorAll(".tuner-string-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          // Tocar diapasão de referência
          playReferenceTone(str.freq);
        }
      };
      container.appendChild(btn);
    });
  }

  function setInstrument(instrumentKey) {
    currentInstrument = instrumentKey;
    targetString = null;
    stopReferenceTone();

    document.querySelectorAll(".tuner-instrument-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.instrument === instrumentKey);
    });

    renderStrings(instrumentKey);
    resetDisplay();
  }

  function openTuner() {
    const modal = document.getElementById("tunerModal");
    if (!modal) return;
    modal.classList.add("active");
    setInstrument(currentInstrument);
    void startListening();
  }

  function closeTuner() {
    const modal = document.getElementById("tunerModal");
    if (modal) modal.classList.remove("active");
    stopListening();
  }

  window.CifraHubTuner = Object.freeze({
    open: openTuner,
    close: closeTuner,
    setInstrument,
    stopListening,
  });
})();
