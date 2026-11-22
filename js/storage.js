// js/storage.js — Persistencia local, racha, badges, estadísticas, CSV y respaldo JSON
const STORAGE_KEY = "vocab_progress_v1";

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getYesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().split("T")[0];
}

function createDefaultProgress() {
  return {
    xp: 0,
    streak: 0,
    lastStudied: null,
    dailyHistory: {},
    preferences: {
      priority: "cefr_high",
      mode: "mixed",
      category: "all",
    },
    badges: {
      primera_palabra: false,
      racha_7: false,
      racha_30: false,
      cien_palabras: false,
      nivel_b2: false,
    },
    words: {},
  };
}

function createDefaultWordState(today = getTodayStr()) {
  return {
    e: 2.5,
    i: 0,
    r: 0,
    n: today,
    err: 0,
    exp: 0,
    stage: 0,
  };
}

function isWordLearned(st) {
  if (!st) return false;
  return (Number(st.stage) || 0) >= 2 || (Number(st.i) || 0) >= 14;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createDefaultProgress();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw);
    const defaults = createDefaultProgress();
    return {
      ...defaults,
      ...parsed,
      dailyHistory: parsed.dailyHistory || {},
      preferences: {
        ...defaults.preferences,
        ...(parsed.preferences || {}),
      },
      badges: {
        ...defaults.badges,
        ...(parsed.badges || {}),
      },
      words: parsed.words || {},
    };
  } catch (err) {
    console.error("Error leyendo progreso de localStorage:", err);
    return createDefaultProgress();
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (err) {
    console.error("Error guardando progreso en localStorage:", err);
  }
}

function getWordState(progress, wordId) {
  const key = String(wordId);
  if (!progress.words[key]) {
    progress.words[key] = createDefaultWordState();
  }
  return progress.words[key];
}

function recordStudyActivity(progress, { isCorrect, xpEarned }) {
  const today = getTodayStr();
  const yesterday = getYesterdayStr();

  if (progress.lastStudied === yesterday) {
    progress.streak = (Number(progress.streak) || 0) + 1;
  } else if (progress.lastStudied !== today) {
    progress.streak = 1;
  }
  progress.lastStudied = today;

  if (!progress.dailyHistory[today]) {
    progress.dailyHistory[today] = { attempts: 0, correct: 0, xp: 0 };
  }
  progress.dailyHistory[today].attempts += 1;
  if (isCorrect) {
    progress.dailyHistory[today].correct += 1;
  }
  progress.dailyHistory[today].xp += Number(xpEarned) || 0;

  const wordStates = Object.values(progress.words || {});
  const startedCount = wordStates.filter((w) => (Number(w.exp) || 0) > 0).length;
  const matureCount = wordStates.filter((w) => (Number(w.r) || 0) >= 3).length;

  progress.badges.primera_palabra = progress.badges.primera_palabra || startedCount >= 1;
  progress.badges.cien_palabras = progress.badges.cien_palabras || startedCount >= 100;
  progress.badges.racha_7 = progress.badges.racha_7 || (Number(progress.streak) || 0) >= 7;
  progress.badges.racha_30 = progress.badges.racha_30 || (Number(progress.streak) || 0) >= 30;
  progress.badges.nivel_b2 = progress.badges.nivel_b2 || matureCount >= 500;

  return progress;
}

function computeStats(progress, vocabulary = []) {
  const totalCorpus = vocabulary.length;
  const wordStates = Object.values(progress.words || {});
  const totalExposures = wordStates.reduce((sum, w) => sum + (Number(w.exp) || 0), 0);
  const startedWords = wordStates.filter((w) => (Number(w.exp) || 0) > 0).length;
  const masteredWords = wordStates.filter((w) => isWordLearned(w)).length;
  const pendingWords = Math.max(0, totalCorpus - masteredWords);

  const levels = ["C2", "C1", "B2", "B1", "A2", "A1"];
  const cefrCounts = {};
  for (const lvl of levels) {
    cefrCounts[lvl] = { total: 0, started: 0, learned: 0 };
  }

  const vocabById = new Map();
  for (const item of vocabulary) {
    vocabById.set(String(item.ID), item);
    const lvl = String(item.CEFR_Level || "").toUpperCase().trim();
    if (cefrCounts[lvl]) {
      cefrCounts[lvl].total += 1;
      const st = progress.words?.[String(item.ID)];
      if (st && (Number(st.exp) || 0) > 0) {
        cefrCounts[lvl].started += 1;
      }
      if (isWordLearned(st)) {
        cefrCounts[lvl].learned += 1;
      }
    }
  }

  const topErrors = Object.entries(progress.words || {})
    .filter(([, st]) => (Number(st.err) || 0) > 0)
    .map(([id, st]) => {
      const item = vocabById.get(String(id));
      return {
        id,
        term: item?.Term_EN || `ID ${id}`,
        meaning: item?.Meaning_ES || "",
        errors: Number(st.err) || 0,
      };
    })
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 10);

  const last7Days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dateStr = new Date(Date.now() - offset * 86400000).toISOString().split("T")[0];
    const entry = progress.dailyHistory?.[dateStr] || { attempts: 0, correct: 0, xp: 0 };
    last7Days.push({
      date: dateStr,
      label: dateStr.slice(5),
      attempts: Number(entry.attempts) || 0,
      xp: Number(entry.xp) || 0,
    });
  }

  return {
    totalCorpus,
    totalExposures,
    startedWords,
    masteredWords,
    pendingWords,
    cefrCounts,
    topErrors,
    last7Days,
  };
}

function escapeCSV(val) {
  const str = String(val ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportTopFrequentCSV(vocabulary = [], progress = {}) {
  const sorted = [...vocabulary].sort(
    (a, b) => (Number(b.Total_Freq) || 0) - (Number(a.Total_Freq) || 0)
  );

  const headers = [
    "Rank_Freq",
    "ID",
    "Term_EN",
    "Meaning_ES",
    "CEFR_Level",
    "Category",
    "Total_Freq",
    "Stage",
    "Streak_r",
    "Errors_err",
    "Exposures_exp",
  ];

  const rows = sorted.map((item, idx) => {
    const st = progress.words?.[String(item.ID)] || {};
    return [
      idx + 1,
      item.ID,
      item.Term_EN,
      item.Meaning_ES,
      item.CEFR_Level,
      item.Category,
      item.Total_Freq ?? 0,
      st.stage ?? 0,
      st.r ?? 0,
      st.err ?? 0,
      st.exp ?? 0,
    ]
      .map(escapeCSV)
      .join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `palabras-mas-repetidas-${getTodayStr()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportProgressJSON(progress) {
  const payload = JSON.stringify(progress, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `english-c1-progress-${getTodayStr()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importProgressJSON(file, onSuccess, onError) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(String(event.target?.result || ""));
      if (!parsed || typeof parsed !== "object" || typeof parsed.words !== "object") {
        throw new Error("El archivo no tiene una estructura de progreso válida.");
      }
      const defaults = createDefaultProgress();
      const merged = {
        ...defaults,
        ...parsed,
        dailyHistory: parsed.dailyHistory || {},
        preferences: { ...defaults.preferences, ...(parsed.preferences || {}) },
        badges: { ...defaults.badges, ...(parsed.badges || {}) },
        words: parsed.words || {},
      };
      saveProgress(merged);
      if (onSuccess) onSuccess(merged);
    } catch (err) {
      console.error("Error importando JSON:", err);
      if (onError) onError(err.message || "No se pudo importar el archivo JSON.");
    }
  };
  reader.onerror = () => {
    if (onError) onError("Error de lectura al abrir el archivo.");
  };
  reader.readAsText(file);
}