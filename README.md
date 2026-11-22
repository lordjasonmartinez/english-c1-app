# English C1 App — Memorización Activa

Aplicación web *local-first* construida con HTML, CSS y JavaScript puro para entrenar vocabulario avanzado en inglés (enfoque C1/C2 y contextos reales) mediante repetición espaciada, recuerdo activo y práctica oral.

## Metodología y conceptos clave

* **SM-2 (SuperMemo 2):** Algoritmo de repetición espaciada que ajusta el intervalo de repaso (`i`) y el factor de facilidad (`e`) según tus respuestas.
* **Ciclo escalonado de 4 pasadas:** Cada palabra de la sesión recorre pasos progresivos (`Pronunciar palabra` → `Escribir palabra` → `Completar frase` → `Pronunciar frase`) para reforzar comprensión, escritura y habla en una misma tanda.
* **CEFR (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`):** Clasificación del nivel de dificultad/dominio del vocabulario en el corpus.
* **Total_Freq:** Métrica de frecuencia/repetición del término en el corpus para priorizar palabras con mayor peso de uso.
* **TTS (*Text-to-Speech*) y Shadowing:** Síntesis de voz para escuchar palabras, frases en inglés y mnemotecnias en español, combinada con reconocimiento de voz (`SpeechRecognition`) para practicar pronunciación en voz alta.
* **Local-first (`localStorage`):** Todo tu progreso queda guardado en el navegador de cada dispositivo (`PC`, `Samsung A22`, `Pixel 8`), con soporte para **Exportar / Importar progreso (.json)** y **Exportar CSV** de frecuencia y nivel.

## Significado de letras y campos en el JSON exportado

Dentro de `words[ID]` cada palabra guarda su estado compacto:

* `e`: **Ease factor** (factor de facilidad SM-2; inicia en `2.5`, mínimo `1.3`).
* `i`: **Interval** (intervalo actual de repaso en días).
* `r`: **Repetitions** (aciertos consecutivos sin fallar).
* `n`: **Next review** (fecha `YYYY-MM-DD` del próximo repaso programado).
* `err`: **Errors** (cantidad acumulada de fallos en el término).
* `exp`: **Exposures** (cantidad total de exposiciones/prácticas realizadas).
* `stage`: **Etapa de maduración** (`0` = anclaje inicial, `1` = recuerdo activo, `2` = consolidación).

A nivel raíz del JSON también se guardan `xp`, `streak` (racha diaria), `lastStudied`, `dailyHistory`, `preferences` y `badges`.

## Despliegue en GitHub Pages

1. Sube los archivos de la aplicación (`index.html`, `css/`, `js/`, `data/vocabulary.json`) a tu repositorio en GitHub.
2. Ve a **Settings → Pages**.
3. Selecciona la rama principal y la carpeta correspondiente (`/ (root)` o `/docs` según cómo organices el repo) y guarda.
4. Abre la URL generada por GitHub Pages desde tu PC o celular (Samsung A22 / Pixel 8).