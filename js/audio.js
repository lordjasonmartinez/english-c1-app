// js/audio.js — TTS en inglés (con tu selección actual), TTS en español para mnemotecnia y Shadowing

function hasSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickBestEnglishVoice(isSentence = false) {
  if (!hasSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const enVoices = voices.filter((v) => /^en[-_]/i.test(v.lang));
  if (!enVoices.length) return null;

  const preferredKeywords = isSentence
    ? ["natural", "neural", "google", "microsoft", "aria", "jenny", "guy", "samantha", "daniel"]
    : ["natural", "neural", "google", "microsoft", "en-us", "en-gb"];

  const scored = enVoices
    .map((v) => {
      const hay = `${v.name} ${v.lang}`.toLowerCase();
      let score = 0;
      if (/en[-_](us|gb)/i.test(v.lang)) score += 10;
      if (!v.localService) score += 5;
      preferredKeywords.forEach((kw, idx) => {
        if (hay.includes(kw)) score += (preferredKeywords.length - idx) * 3;
      });
      return { voice: v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.voice || enVoices[0];
}

function pickBestSpanishVoice() {
  if (!hasSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const esVoices = voices.filter((v) => /^es[-_]/i.test(v.lang));
  if (!esVoices.length) return null;

  const preferred = ["natural", "neural", "google", "microsoft", "es-419", "es-us", "es-co", "es-es"];
  const scored = esVoices
    .map((v) => {
      const hay = `${v.name} ${v.lang}`.toLowerCase();
      let score = 0;
      if (!v.localService) score += 4;
      preferred.forEach((kw, idx) => {
        if (hay.includes(kw)) score += (preferred.length - idx) * 2;
      });
      return { voice: v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.voice || esVoices[0];
}

function speakEnglish(text, options = {}) {
  const { slow = false, isSentence = false, onStart, onEnd, onError } = options;
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    if (onError) onError("No hay texto en inglés para pronunciar.");
    return;
  }

  if (!hasSpeechSynthesis()) {
    if (onError) onError("Tu navegador no soporta síntesis de voz (TTS).");
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";

    if (slow) {
      utterance.rate = 0.68;
      utterance.pitch = 1.0;
    } else if (isSentence) {
      utterance.rate = 0.96;
      utterance.pitch = 1.02;
    } else {
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
    }

    const bestVoice = pickBestEnglishVoice(isSentence);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = (ev) => {
      if (onError) onError(ev.error || "Error al reproducir audio.");
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Error en speakEnglish:", err);
    if (onError) onError("No se pudo iniciar la lectura de audio.");
  }
}

function speakSpanish(text, options = {}) {
  const { onStart, onEnd, onError } = options;
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    if (onError) onError("No hay texto en español para leer.");
    return;
  }

  if (!hasSpeechSynthesis()) {
    if (onError) onError("Tu navegador no soporta síntesis de voz (TTS).");
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "es-ES";
    utterance.rate = 0.98;
    utterance.pitch = 1.0;

    const esVoice = pickBestSpanishVoice();
    if (esVoice) {
      utterance.voice = esVoice;
      utterance.lang = esVoice.lang;
    }

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = (ev) => {
      if (onError) onError(ev.error || "Error al reproducir la mnemotecnia.");
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Error en speakSpanish:", err);
    if (onError) onError("No se pudo leer la mnemotecnia.");
  }
}

function stopSpeaking() {
  if (hasSpeechSynthesis()) {
    window.speechSynthesis.cancel();
  }
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function hasSpeechRecognition() {
  return Boolean(getSpeechRecognitionConstructor());
}

function listenEnglish(callbacks = {}) {
  const RecognitionClass = getSpeechRecognitionConstructor();
  if (!RecognitionClass) {
    if (callbacks.onError) {
      callbacks.onError(
        "El reconocimiento de voz no está disponible en este navegador. Usa Chrome/Edge o escribe la respuesta."
      );
    }
    return null;
  }

  try {
    stopSpeaking();
    const recognition = new RecognitionClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      if (callbacks.onStart) callbacks.onStart();
    };

    recognition.onresult = (event) => {
      const resultList = event.results?.[0];
      const alternatives = [];
      if (resultList) {
        for (let i = 0; i < resultList.length; i += 1) {
          if (resultList[i]?.transcript) {
            alternatives.push(resultList[i].transcript.trim());
          }
        }
      }
      const transcript = alternatives[0] || "";
      if (callbacks.onResult) callbacks.onResult(transcript, alternatives);
    };

    recognition.onerror = (event) => {
      let msg = "No se pudo capturar la voz.";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        msg = "Permiso de micrófono denegado o bloqueado en el navegador.";
      } else if (event.error === "no-speech") {
        msg = "No detecté voz. Intenta hablar un poco más cerca o más claro.";
      } else if (event.error === "audio-capture") {
        msg = "No se detectó un micrófono disponible.";
      } else if (event.error === "network") {
        msg = "Error de red en el servicio de reconocimiento de voz.";
      }
      if (callbacks.onError) callbacks.onError(msg, event.error);
    };

    recognition.onend = () => {
      if (callbacks.onEnd) callbacks.onEnd();
    };

    recognition.start();
    return recognition;
  } catch (err) {
    console.error("Error iniciando reconocimiento de voz:", err);
    if (callbacks.onError) {
      callbacks.onError("No se pudo iniciar el micrófono.");
    }
    return null;
  }
}