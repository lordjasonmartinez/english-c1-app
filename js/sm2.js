// js/sm2.js — SM-2, etapas, prioridades, categorías, modo falladas y 4 pasadas en todos los modos
const CEFR_RANK = {
  C2: 6,
  C1: 5,
  B2: 4,
  B1: 3,
  A2: 2,
  A1: 1,
};

function getCefrRank(level) {
  if (!level) return 0;
  return CEFR_RANK[String(level).toUpperCase().trim()] ?? 0;
}

function getPriorityScore(word, priority = "cefr_high") {
  const cefr = getCefrRank(word.CEFR_Level);
  const freq = Number(word.Total_Freq) || 0;

  if (priority === "high_freq") {
    return freq * 100 + cefr * 10;
  }
  if (priority === "balanced") {
    return cefr * 250 + Math.min(freq, 2000);
  }
  return cefr * 100000 + freq;
}

function applySM2(state, correct, options = {}) {
  const today = getTodayStr();
  const advanceStage = options.advanceStage !== false;
  const quality =
    typeof options.quality === "number"
      ? Math.max(0, Math.min(5, options.quality))
      : correct
      ? 4
      : 1;

  state.exp = (Number(state.exp) || 0) + 1;

  if (quality >= 3) {
    if (state.r === 0) {
      state.i = 1;
    } else if (state.r === 1) {
      state.i = 6;
    } else {
      state.i = Math.max(1, Math.round((Number(state.i) || 1) * (Number(state.e) || 2.5)));
    }
    state.r = (Number(state.r) || 0) + 1;

    if (advanceStage) {
      const currentStage = Number(state.stage) || 0;
      if (state.r >= 3 && currentStage < 2) {
        state.stage = 2;
      } else if (state.r >= 1 && currentStage < 1) {
        state.stage = 1;
      }
    }
  } else {
    state.r = 0;
    state.i = 1;
    state.err = (Number(state.err) || 0) + 1;
    if (advanceStage) {
      const currentStage = Number(state.stage) || 0;
      state.stage = Math.max(0, currentStage - 1);
    }
  }

  const prevE = Number(state.e) || 2.5;
  const deltaE = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  state.e = Math.max(1.3, Number((prevE + deltaE).toFixed(2)));

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + state.i);
  state.n = nextDate.toISOString().split("T")[0];
  state.lastReviewed = today;

  return state;
}

function buildBaseWordPool(allWords, progress, config = {}) {
  const priority = config.priority || progress.preferences?.priority || "cefr_high";
  const mode = config.mode || progress.preferences?.mode || "mixed";
  const category = config.category || progress.preferences?.category || "all";

  const filteredWords =
    category && category !== "all"
      ? allWords.filter((w) => String(w.Category || "").trim() === category)
      : allWords;

  const maxWords =
    mode === "night_quick" ? 2 : mode === "failed_only" ? 10 : config.maxWords || 6;
  const warmupCount = mode === "night_quick" ? 1 : config.warmupCount || 2;
  const allowWarmup = mode === "mixed" || mode === "writing" || mode === "night_quick";

  const today = getTodayStr();
  const seenIds = new Set();
  const pool = [];

  const pushUnique = (word, role) => {
    if (!word || !word.ID) return;
    const id = String(word.ID);
    if (seenIds.has(id) || pool.length >= maxWords) return;
    seenIds.add(id);
    pool.push({
      ...word,
      _role: role,
    });
  };

  const studiedWords = filteredWords.filter((w) => {
    const st = progress.words[String(w.ID)];
    return st && ((Number(st.exp) || 0) > 0 || (Number(st.r) || 0) > 0);
  });

  const failedWords = filteredWords
    .filter((w) => (Number(progress.words[String(w.ID)]?.err) || 0) > 0)
    .sort((a, b) => {
      const scoreDiff = getPriorityScore(b, priority) - getPriorityScore(a, priority);
      if (scoreDiff !== 0) return scoreDiff;
      return (
        (Number(progress.words[String(b.ID)]?.err) || 0) -
        (Number(progress.words[String(a.ID)]?.err) || 0)
      );
    });

  if (mode === "failed_only") {
    for (const w of failedWords) pushUnique(w, "enemy");
    return pool;
  }

  if (allowWarmup && studiedWords.length > 0) {
    const warmupPool = [...studiedWords].sort(
      (a, b) => getPriorityScore(b, priority) - getPriorityScore(a, priority)
    );
    for (const w of warmupPool.slice(0, warmupCount)) {
      pushUnique(w, "warmup");
    }
  }

  const enemies = failedWords.filter((w) => (Number(progress.words[String(w.ID)]?.err) || 0) >= 3);

  const dueReviews = filteredWords
    .filter((w) => {
      const st = progress.words[String(w.ID)];
      return st && st.n && st.n <= today && (Number(st.exp) || 0) > 0;
    })
    .sort((a, b) => {
      const scoreDiff = getPriorityScore(b, priority) - getPriorityScore(a, priority);
      if (scoreDiff !== 0) return scoreDiff;
      return String(progress.words[String(a.ID)]?.n || "").localeCompare(
        String(progress.words[String(b.ID)]?.n || "")
      );
    });

  const newWords = filteredWords
    .filter((w) => (Number(progress.words[String(w.ID)]?.exp) || 0) === 0)
    .sort((a, b) => getPriorityScore(b, priority) - getPriorityScore(a, priority));

  if (mode === "new_only") {
    for (const w of newWords) pushUnique(w, "new");
    if (pool.length < maxWords) {
      for (const w of dueReviews) pushUnique(w, "review");
    }
    return pool;
  }

  if (mode === "review_hard") {
    for (const w of enemies) pushUnique(w, "enemy");
    for (const w of dueReviews) pushUnique(w, "review");
    if (pool.length < maxWords) {
      for (const w of failedWords) pushUnique(w, "enemy");
    }
    return pool;
  }

  for (const w of enemies.slice(0, 2)) pushUnique(w, "enemy");
  for (const w of dueReviews) pushUnique(w, "review");
  for (const w of newWords) pushUnique(w, "new");

  return pool;
}

/**
 * Aplica siempre el ciclo escalonado de 4 pasadas en todos los modos:
 * 1) speak_word: pronunciar palabra
 * 2) write_word: escribir palabra
 * 3) fill_sentence: completar frase
 * 4) speak_sentence: pronunciar frase
 */
function buildSessionQueue(allWords, progress, config = {}) {
  const baseWords = buildBaseWordPool(allWords, progress, config);
  if (!baseWords.length) return [];

  const queue = [];

  for (const w of baseWords) {
    const hasSentence = Boolean(w.Example_Sentence && w.Term_EN);
    const sequence = [
      { type: "speak_word", actionTitle: "🎙️ PRONUNCIAR PALABRA", shortLabel: "1/4 · Pronunciar" },
      { type: "write_word", actionTitle: "⌨️ ESCRIBIR PALABRA", shortLabel: "2/4 · Escribir" },
      hasSentence
        ? { type: "fill_sentence", actionTitle: "✍️ COMPLETAR FRASE", shortLabel: "3/4 · Completar" }
        : { type: "write_word", actionTitle: "⌨️ ESCRIBIR PALABRA", shortLabel: "3/4 · Escribir" },
      hasSentence
        ? { type: "speak_sentence", actionTitle: "🎙️ PRONUNCIAR FRASE", shortLabel: "4/4 · Frase voz" }
        : { type: "speak_word", actionTitle: "🎙️ PRONUNCIAR PALABRA", shortLabel: "4/4 · Pronunciar" },
    ];

    sequence.forEach((step, idx) => {
      queue.push({
        ...w,
        _stepType: step.type,
        _actionTitle: step.actionTitle,
        _stepLabel: step.shortLabel,
        _isFinalStep: idx === sequence.length - 1,
      });
    });
  }

  return queue;
}