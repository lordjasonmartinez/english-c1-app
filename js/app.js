// js/app.js — Gate en inglés, categorías, 4 pasadas, banner, mnemotecnia ES, gráfica, CEFR, glosario y CSV
const GATE_SECRET = "jason";
const GATE_STORAGE_KEY = "vocab_gate_unlocked_v1";

let vocabulary = [];
let sessionQueue = [];
let currentIndex = 0;
let progress = null;
let waitingNext = false;
let activeRecognition = null;

const ROLE_LABELS = {
  warmup: "Calentamiento",
  enemy: "Difícil / Fallada",
  review: "Repaso SM-2",
  new: "Nueva",
};

const BADGE_LABELS = {
  primera_palabra: "🌱 Primera palabra",
  racha_7: "🔥 Racha 7 días",
  racha_30: "🏆 Racha 30 días",
  cien_palabras: "📚 100 palabras",
  nivel_b2: "🚀 500 consolidadas",
};

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isGateUnlocked() {
  try {
    return localStorage.getItem(GATE_STORAGE_KEY) === "1";
  } catch (_) {
    return true;
  }
}

function setGateUnlocked(unlocked) {
  try {
    if (unlocked) {
      localStorage.setItem(GATE_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(GATE_STORAGE_KEY);
    }
  } catch (_) {}
}

function applyGateState() {
  const unlocked = isGateUnlocked();
  const gateScreen = document.getElementById("gate-screen");
  const appShell = document.getElementById("app-shell");

  if (unlocked) {
    gateScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
  } else {
    stopSpeaking();
    appShell.classList.add("hidden");
    gateScreen.classList.remove("hidden");
    document.getElementById("gate-error").classList.add("hidden");
    const gateInput = document.getElementById("gate-input");
    gateInput.value = "";
    setTimeout(() => gateInput.focus(), 50);
  }
}

function normalizeText(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'()¿¡]/g, "")
    .replace(/\s+/g, " ");
}

function setVoiceStatus(message, type = "") {
  const el = document.getElementById("voice-status");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.className = "voice-status hidden";
    return;
  }
  el.textContent = message;
  el.className = `voice-status ${type}`.trim();
}

function updateHeaderStats() {
  document.getElementById("xp-pill").textContent = `XP: ${Number(progress.xp) || 0}`;
  document.getElementById("streak-pill").textContent = `🔥 Racha: ${Number(progress.streak) || 0}d`;
  document.getElementById("corpus-status").textContent =
    `${vocabulary.length} términos · Cola: ${sessionQueue.length}`;
}

function populateCategoryFilter() {
  const selectEl = document.getElementById("category-select");
  const prevVal = progress.preferences?.category || "all";

  const categories = Array.from(
    new Set(
      vocabulary
        .map((w) => String(w.Category || "").trim())
        .filter((c) => c.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  selectEl.innerHTML =
    `<option value="all">Todas las categorías</option>` +
    categories.map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`).join("");

  const hasPrev = Array.from(selectEl.options).some((opt) => opt.value === prevVal);
  selectEl.value = hasPrev ? prevVal : "all";
}

function renderStatsView() {
  const stats = computeStats(progress, vocabulary);
  document.getElementById("stat-started").textContent = stats.startedWords;
  document.getElementById("stat-mastered").textContent = stats.masteredWords;
  document.getElementById("stat-exposures").textContent = stats.totalExposures;

  const pct =
    stats.totalCorpus > 0
      ? Math.min(100, Math.round((stats.masteredWords / stats.totalCorpus) * 100))
      : 0;
  document.getElementById("chart-mastered-txt").textContent = stats.masteredWords;
  document.getElementById("chart-pending-txt").textContent = stats.pendingWords;
  document.getElementById("chart-mastered-bar").style.width = `${pct}%`;
  document.getElementById("chart-pct-txt").textContent =
    `${pct}% consolidado (${stats.masteredWords} de ${stats.totalCorpus} términos)`;

  const badgesEl = document.getElementById("badges-list");
  badgesEl.innerHTML = Object.entries(BADGE_LABELS)
    .map(([key, label]) => {
      const unlocked = Boolean(progress.badges?.[key]);
      return `<span class="badge-chip ${unlocked ? "unlocked" : ""}">${label}</span>`;
    })
    .join("");

  const weekEl = document.getElementById("week-grid");
  weekEl.innerHTML = stats.last7Days
    .map(
      (d) => `
      <div class="day-cell ${d.attempts > 0 ? "active" : ""}" title="${d.date}: ${d.attempts} intentos, +${d.xp} XP">
        <div>${d.label}</div>
        <strong>${d.attempts}</strong>
      </div>`
    )
    .join("");

  const cefrEl = document.getElementById("cefr-grid");
  cefrEl.innerHTML = Object.entries(stats.cefrCounts)
    .map(
      ([lvl, info]) => `
      <div class="cefr-card ${info.learned > 0 ? "has-learned" : ""}">
        <span class="cefr-lvl-title">Nivel ${lvl}</span>
        <strong class="cefr-learned-num">${info.learned} aprendidas</strong>
        <span class="cefr-sub">${info.started} iniciadas / ${info.total} total</span>
      </div>`
    )
    .join("");

  const errorsEl = document.getElementById("top-errors-list");
  if (!stats.topErrors.length) {
    errorsEl.innerHTML = `<li class="muted-small">Aún no tienes palabras con errores registrados.</li>`;
  } else {
    errorsEl.innerHTML = stats.topErrors
      .map(
        (item) => `
        <li class="error-item">
          <span><strong>${escapeHTML(item.term)}</strong> — ${escapeHTML(item.meaning)}</span>
          <span>${item.errors} error(es)</span>
        </li>`
      )
      .join("");
  }
}

function showView(viewName) {
  stopSpeaking();
  const trainingEl = document.getElementById("training-view");
  const statsEl = document.getElementById("stats-view");
  if (viewName === "stats") {
    trainingEl.classList.add("hidden");
    statsEl.classList.remove("hidden");
    renderStatsView();
  } else {
    statsEl.classList.add("hidden");
    trainingEl.classList.remove("hidden");
  }
}

function rebuildSession() {
  if (!vocabulary.length) return;
  stopSpeaking();
  if (activeRecognition) {
    try { activeRecognition.abort(); } catch (_) {}
    activeRecognition = null;
  }

  const priority = document.getElementById("priority-select").value;
  const category = document.getElementById("category-select").value;
  const mode = document.getElementById("mode-select").value;

  progress.preferences = { priority, category, mode };
  saveProgress(progress);

  sessionQueue = buildSessionQueue(vocabulary, progress, { priority, category, mode });
  currentIndex = 0;

  const uniqueWords = new Set(sessionQueue.map((w) => String(w.ID))).size;
  document.getElementById("session-summary").textContent = sessionQueue.length
    ? `${uniqueWords} palabra(s) · ${sessionQueue.length} pasadas en cola`
    : "No hay palabras para este filtro";

  updateHeaderStats();
  renderCard(0);
}

async function loadVocabulary() {
  const statusEl = document.getElementById("corpus-status");
  try {
    const response = await fetch("./data/vocabulary.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("El JSON está vacío.");
    }
    vocabulary = data;
    populateCategoryFilter();
    rebuildSession();
  } catch (error) {
    console.error("Error cargando vocabulary.json:", error);
    statusEl.textContent = "Error al cargar datos";
    document.getElementById("prompt-main").textContent =
      "Verifica que el servidor local esté corriendo y exista ./data/vocabulary.json";
  }
}

function renderCard(index) {
  stopSpeaking();
  setVoiceStatus("");
  const micBtn = document.getElementById("btn-mic");
  if (micBtn) micBtn.classList.remove("recording", "highlight-mic");

  if (!sessionQueue.length) {
    document.getElementById("action-banner-title").textContent = "SIN TARJETAS";
    document.getElementById("action-banner-sub").textContent =
      "Prueba cambiar la categoría o el modo de sesión.";
    document.getElementById("prompt-main").textContent = "No hay tarjetas para este filtro";
    document.getElementById("prompt-sub").innerHTML = "";
    document.getElementById("mnemonic-text").textContent = "—";
    document.getElementById("answer-form").classList.add("hidden");
    document.getElementById("feedback-panel").classList.add("hidden");
    return;
  }

  waitingNext = false;
  currentIndex = index % sessionQueue.length;

  const item = sessionQueue[currentIndex];
  const st = getWordState(progress, item.ID);
  const stepType = item._stepType || "write_word";
  const isSpeakStep = stepType === "speak_word" || stepType === "speak_sentence";

  document.getElementById("feedback-panel").classList.add("hidden");
  document.getElementById("answer-form").classList.remove("hidden");

  const inputEl = document.getElementById("answer-input");
  inputEl.value = "";

  const bannerEl = document.getElementById("action-banner");
  bannerEl.classList.remove("action-speak", "action-write");
  bannerEl.classList.add(isSpeakStep ? "action-speak" : "action-write");
  document.getElementById("action-banner-title").textContent =
    item._actionTitle || (isSpeakStep ? "🎙️ PRONUNCIAR" : "⌨️ ESCRIBIR");

  if (isSpeakStep) {
    micBtn.classList.add("highlight-mic");
  } else {
    setTimeout(() => inputEl.focus(), 30);
  }

  document.getElementById("step-label").textContent = `PASADA ${item._stepLabel || "PASO"}`;
  document.getElementById("role-pill").textContent = ROLE_LABELS[item._role] || item._role;

  const meaning = item.Meaning_ES || "(Pendiente de enriquecer)";
  const termEN = item.Term_EN || "";
  const hasExample = Boolean(item.Example_Sentence && termEN);

  if (stepType === "speak_word") {
    document.getElementById("action-banner-sub").textContent =
      "Pronuncia en voz alta la palabra en inglés (y su frase si aparece abajo).";
    document.getElementById("prompt-main").textContent = termEN || meaning;

    let subHtml = `<p class="muted">Significado: <strong>${escapeHTML(meaning)}</strong>${
      item.Pronunciation_ES ? ` · Guía: ${escapeHTML(item.Pronunciation_ES)}` : ""
    }</p>`;

    if (hasExample) {
      const escapedTerm = termEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const highlightedSentence = escapeHTML(item.Example_Sentence).replace(
        new RegExp(`\\b(${escapedTerm})\\b`, "gi"),
        `<strong class="term-highlight">$1</strong>`
      );
      subHtml += `<p class="sentence-preview">Frase: "${highlightedSentence}"</p>`;
    }

    document.getElementById("prompt-sub").innerHTML = subHtml;
    inputEl.placeholder = "Pulsa Pronunciar / Shadowing o escribe el término...";
  } else if (stepType === "fill_sentence" && hasExample) {
    const escaped = termEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const masked = escapeHTML(item.Example_Sentence).replace(
      new RegExp(`\\b${escaped}\\b`, "i"),
      `<strong class="term-highlight">_____</strong>`
    );
    document.getElementById("action-banner-sub").textContent =
      "Completa la palabra que falta dentro de la oración.";
    document.getElementById("prompt-main").textContent = meaning;
    document.getElementById("prompt-sub").innerHTML =
      `<p class="sentence-preview">Frase: "${masked}"</p>`;
    inputEl.placeholder = "Escribe la palabra faltante...";
  } else if (stepType === "speak_sentence" && hasExample) {
    const escapedTerm = termEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const highlightedSentence = escapeHTML(item.Example_Sentence).replace(
      new RegExp(`\\b(${escapedTerm})\\b`, "gi"),
      `<strong class="term-highlight">$1</strong>`
    );
    document.getElementById("action-banner-sub").textContent =
      "Lee o escucha y pronuncia la oración completa en voz alta.";
    document.getElementById("prompt-main").innerHTML = highlightedSentence;
    document.getElementById("prompt-sub").innerHTML = `<p class="muted"><strong>${escapeHTML(
      termEN
    )}</strong> — ${escapeHTML(meaning)}${
      item.Example_Translation ? ` · <em>"${escapeHTML(item.Example_Translation)}"</em>` : ""
    }</p>`;
    inputEl.placeholder = "Pronuncia la frase con el micrófono o escríbelala...";
  } else {
    document.getElementById("action-banner-sub").textContent =
      "Recuerda y escribe el término en inglés.";
    document.getElementById("prompt-main").textContent = meaning;
    document.getElementById("prompt-sub").innerHTML = item.Usage_Type
      ? `<p class="muted">Uso: ${escapeHTML(item.Usage_Type)}</p>`
      : "";
    inputEl.placeholder = "Escribe el término en inglés...";
  }

  document.getElementById("mnemonic-text").textContent =
    item.Mnemonic_Anchor ||
    "Imagina una escena concreta de tu trabajo o día a día conectada con esta palabra.";

  document.getElementById("meta-info").textContent =
    `[${currentIndex + 1}/${sessionQueue.length}] · Stage: ${st.stage} · ` +
    `ID: ${item.ID} · CEFR: ${item.CEFR_Level || "—"} · Cat: ${item.Category || "—"} · Freq: ${item.Total_Freq ?? 0}`;
}

function getExpectedForStep(item) {
  const stepType = item._stepType || "write_word";
  if (stepType === "speak_sentence" && item.Example_Sentence) {
    return item.Example_Sentence;
  }
  return item.Term_EN || "";
}

function isSpokenMatch(expected, actual, stepType) {
  const expNorm = normalizeText(expected);
  const actNorm = normalizeText(actual);
  if (!expNorm || !actNorm) return false;
  if (actNorm === expNorm) return true;
  if (stepType === "speak_sentence") {
    const expWords = expNorm.split(" ");
    const actWords = actNorm.split(" ");
    const matches = expWords.filter((w) => actWords.includes(w)).length;
    return matches / expWords.length >= 0.65;
  }
  return false;
}

function showFeedback(item, st, isCorrect, spokenInfo = "") {
  waitingNext = true;
  document.getElementById("answer-form").classList.add("hidden");

  const panel = document.getElementById("feedback-panel");
  panel.classList.remove("hidden", "ok", "err");
  panel.classList.add(isCorrect ? "ok" : "err");

  const statusEl = document.getElementById("feedback-status");
  const solEl = document.getElementById("feedback-solution");

  if (isCorrect) {
    statusEl.textContent = "¡Correcto! +10 XP";
    solEl.innerHTML =
      `Término: <strong>${escapeHTML(item.Term_EN)}</strong> · Intervalo: <strong>${st.i}</strong> día(s) · Stage <strong>${st.stage}</strong>` +
      (spokenInfo ? ` · <em>Escuchado: "${escapeHTML(spokenInfo)}"</em>` : "");
  } else {
    statusEl.textContent = "A reforzar — Regresará pronto";
    solEl.innerHTML =
      `Respuesta correcta: <strong>${escapeHTML(getExpectedForStep(item))}</strong> (${escapeHTML(item.Term_EN)} — ${escapeHTML(item.Meaning_ES || "—")})` +
      (spokenInfo ? ` · <em>Escuchado: "${escapeHTML(spokenInfo)}"</em>` : "");
  }

  document.getElementById("fb-pron").textContent = item.Pronunciation_ES || "—";
  document.getElementById("fb-anchor").textContent =
    item.Mnemonic_Anchor || "Relaciona la palabra con una situación concreta de trabajo o de tu entorno.";
  document.getElementById("fb-example").textContent = item.Example_Sentence || "—";
  document.getElementById("fb-translation").textContent = item.Example_Translation || "";

  document.getElementById("btn-next-card").focus();
}

function evaluateAttempt(userText, forceFail = false, spokenInfo = "", fromVoice = false) {
  if (waitingNext || !sessionQueue.length) return;
  stopSpeaking();

  const item = sessionQueue[currentIndex];
  const st = getWordState(progress, item.ID);
  const stepType = item._stepType || "write_word";
  const expected = getExpectedForStep(item);

  const isCorrect =
    !forceFail &&
    Boolean(expected) &&
    (fromVoice
      ? isSpokenMatch(expected, userText, stepType)
      : normalizeText(userText) === normalizeText(expected));

  const xpEarned = isCorrect ? 10 : 0;

  if (!isCorrect) {
    applySM2(st, false, { advanceStage: true });
  } else if (item._isFinalStep) {
    applySM2(st, true, { advanceStage: true });
  } else {
    st.exp = (Number(st.exp) || 0) + 1;
  }

  progress.xp = (Number(progress.xp) || 0) + xpEarned;
  recordStudyActivity(progress, { isCorrect, xpEarned });

  saveProgress(progress);
  updateHeaderStats();
  showFeedback(item, st, isCorrect, spokenInfo);
}

function triggerShadowing() {
  if (waitingNext || !sessionQueue.length) return;
  const item = sessionQueue[currentIndex];
  const stepType = item._stepType || "write_word";
  const expected = getExpectedForStep(item);
  const micBtn = document.getElementById("btn-mic");

  if (!hasSpeechRecognition()) {
    setVoiceStatus(
      "Tu navegador no soporta reconocimiento de voz (prueba en Google Chrome o Edge).",
      "error"
    );
    return;
  }

  if (activeRecognition) {
    try { activeRecognition.stop(); } catch (_) {}
    return;
  }

  activeRecognition = listenEnglish({
    onStart: () => {
      micBtn.classList.add("recording");
      micBtn.textContent = "⏹️ Escuchando...";
      setVoiceStatus(`Di "${expected}" en voz alta...`, "listening");
    },
    onResult: (transcript, alternatives) => {
      const inputEl = document.getElementById("answer-input");
      inputEl.value = transcript;
      setVoiceStatus(`Detectado: "${transcript}" — pulsa Comprobar o ajusta si hace falta.`);

      const matchedAny = alternatives.some((alt) => isSpokenMatch(expected, alt, stepType));
      if (matchedAny) {
        evaluateAttempt(transcript, false, transcript, true);
      }
    },
    onError: (msg) => {
      setVoiceStatus(msg, "error");
    },
    onEnd: () => {
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎙️ Pronunciar / Shadowing";
      activeRecognition = null;
    },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  progress = loadProgress();
  const prefs = progress.preferences || {};
  document.getElementById("priority-select").value = prefs.priority || "cefr_high";
  document.getElementById("mode-select").value = prefs.mode || "mixed";

  document.getElementById("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const typed = normalizeText(document.getElementById("gate-input").value);
    const errEl = document.getElementById("gate-error");
    if (typed === normalizeText(GATE_SECRET)) {
      errEl.classList.add("hidden");
      setGateUnlocked(true);
      applyGateState();
      if (!vocabulary.length) {
        loadVocabulary();
      }
    } else {
      errEl.textContent =
        "Nice try, incognito visitor! That isn't the secret passphrase—give it another shot.";
      errEl.classList.remove("hidden");
    }
  });

  document.getElementById("btn-lock-gate").addEventListener("click", () => {
    setGateUnlocked(false);
    applyGateState();
  });

  applyGateState();
  if (isGateUnlocked()) {
    loadVocabulary();
  }

  document.getElementById("btn-toggle-stats").addEventListener("click", () => showView("stats"));
  document.getElementById("btn-back-training").addEventListener("click", () => showView("training"));

  document.getElementById("btn-toggle-glossary").addEventListener("click", () => {
    document.getElementById("glossary-box").classList.toggle("hidden");
  });

  document.getElementById("priority-select").addEventListener("change", rebuildSession);
  document.getElementById("category-select").addEventListener("change", rebuildSession);
  document.getElementById("mode-select").addEventListener("change", rebuildSession);
  document.getElementById("btn-start-session").addEventListener("click", rebuildSession);

  document.getElementById("btn-speak-mnemonic").addEventListener("click", () => {
    const text = document.getElementById("mnemonic-text").textContent;
    speakSpanish(text, {
      onError: (msg) => setVoiceStatus(msg, "error"),
    });
  });

  document.getElementById("btn-speak-normal").addEventListener("click", () => {
    const item = sessionQueue[currentIndex];
    if (item) {
      speakEnglish(item.Term_EN, {
        slow: false,
        isSentence: false,
        onError: (msg) => setVoiceStatus(msg, "error"),
      });
    }
  });

  document.getElementById("btn-speak-slow").addEventListener("click", () => {
    const item = sessionQueue[currentIndex];
    if (item) {
      speakEnglish(item.Term_EN, {
        slow: true,
        isSentence: false,
        onError: (msg) => setVoiceStatus(msg, "error"),
      });
    }
  });

  document.getElementById("btn-speak-example").addEventListener("click", () => {
    const item = sessionQueue[currentIndex];
    if (item && item.Example_Sentence) {
      speakEnglish(item.Example_Sentence, {
        slow: false,
        isSentence: true,
        onError: (msg) => setVoiceStatus(msg, "error"),
      });
    } else {
      setVoiceStatus("Esta palabra aún no tiene frase de ejemplo.", "error");
    }
  });

  document.getElementById("btn-mic").addEventListener("click", triggerShadowing);

  document.getElementById("btn-fb-listen").addEventListener("click", () => {
    const item = sessionQueue[currentIndex];
    if (item) speakEnglish(item.Term_EN, { slow: false, isSentence: false });
  });

  document.getElementById("btn-fb-example").addEventListener("click", () => {
    const item = sessionQueue[currentIndex];
    if (item && item.Example_Sentence) {
      speakEnglish(item.Example_Sentence, { slow: false, isSentence: true });
    }
  });

  document.getElementById("answer-form").addEventListener("submit", (e) => {
    e.preventDefault();
    evaluateAttempt(document.getElementById("answer-input").value, false, "", false);
  });

  document.getElementById("btn-skip").addEventListener("click", () => {
    evaluateAttempt("", true, "", false);
  });

  document.getElementById("btn-next-card").addEventListener("click", () => {
    renderCard(currentIndex + 1);
  });

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    exportTopFrequentCSV(vocabulary, progress);
    document.getElementById("backup-status").textContent =
      "CSV descargado con el ranking por frecuencia y nivel CEFR.";
  });

  document.getElementById("btn-export-json").addEventListener("click", () => {
    exportProgressJSON(progress);
    document.getElementById("backup-status").textContent = "Respaldo .json descargado correctamente.";
  });

  const fileInput = document.getElementById("import-file-input");
  document.getElementById("btn-import-trigger").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importProgressJSON(
      file,
      (imported) => {
        progress = imported;
        const p = progress.preferences || {};
        document.getElementById("priority-select").value = p.priority || "cefr_high";
        document.getElementById("mode-select").value = p.mode || "mixed";
        populateCategoryFilter();
        rebuildSession();
        renderStatsView();
        document.getElementById("backup-status").textContent =
          `Progreso restaurado desde "${file.name}".`;
      },
      (errMsg) => {
        document.getElementById("backup-status").textContent = `Error: ${errMsg}`;
      }
    );
    fileInput.value = "";
  });
});