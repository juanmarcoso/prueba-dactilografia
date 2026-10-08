(() => {
  const SETTINGS_KEY = 'dactilo.practice.settings';
  const DEFAULT_SETTINGS = {
    minutes: 5,
    hideOnStart: false,
    caseSensitive: false,
    ignoreAccents: false,
  };
  const STATUS_LABELS = {
    idle: 'En espera',
    running: 'En curso',
    finished: 'Finalizada',
  };

  const els = {
    appAlert: document.getElementById('appAlert'),
    btnPrint: document.getElementById('btnPrint'),
    btnStart: document.getElementById('btnStart'),
    btnCheck: document.getElementById('btnCheck'),
    btnReset: document.getElementById('btnReset'),
    btnNew: document.getElementById('btnNew'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    practiceMain: document.getElementById('practiceMain'),
    referencePanel: document.getElementById('referencePanel'),
    splitHandle: document.getElementById('splitHandle'),
    snippetTitle: document.getElementById('snippetTitle'),
    snippetMeta: document.getElementById('snippetMeta'),
    referenceText: document.getElementById('referenceText'),
    typingArea: document.getElementById('typingArea'),
    resultOverlay: document.getElementById('result-overlay'),
    toggleShowText: document.getElementById('toggleShowText'),
    selectMinutes: document.getElementById('selectMinutes'),
    countdown: document.getElementById('countdown'),
    liveWords: document.getElementById('liveWords'),
    liveStatus: document.getElementById('liveStatus'),
    timerProgress: document.getElementById('timerProgress'),
    timerBar: document.getElementById('timerBar'),
    resultsPanel: document.getElementById('resultsPanel'),
    saveBadge: document.getElementById('saveBadge'),
    statCorrect: document.getElementById('statCorrect'),
    statTotal: document.getElementById('statTotal'),
    statPrecision: document.getElementById('statPrecision'),
    statWpm: document.getElementById('statWpm'),
    resultsHint: document.getElementById('resultsHint'),
    printSheet: document.getElementById('printSheet'),
    settingsModal: document.getElementById('settingsModal'),
    settingMinutes: document.getElementById('settingMinutes'),
    settingHideOnStart: document.getElementById('settingHideOnStart'),
    settingCaseSensitive: document.getElementById('settingCaseSensitive'),
    settingIgnoreAccents: document.getElementById('settingIgnoreAccents'),
    historyModal: document.getElementById('historyModal'),
    historySummary: document.getElementById('historySummary'),
    histTotal: document.getElementById('histTotal'),
    histPassed: document.getElementById('histPassed'),
    histAvgWpm: document.getElementById('histAvgWpm'),
    histAvgPrecision: document.getElementById('histAvgPrecision'),
    historyLoading: document.getElementById('historyLoading'),
    historyEmpty: document.getElementById('historyEmpty'),
    historyError: document.getElementById('historyError'),
    historyTable: document.getElementById('historyTable'),
    historyBody: document.getElementById('historyBody'),
  };

  let settings = loadSettings();
  const state = {
    snippet: null,
    words: [],
    status: 'idle',
    durationSeconds: settings.minutes * 60,
    startedAt: 0,
    endsAt: 0,
    timerId: null,
    loadingText: false,
  };

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return Object.assign({}, DEFAULT_SETTINGS, stored || {});
    } catch (err) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      return;
    }
  }

  function currentMode() {
    return els.toggleShowText.checked ? 'digital' : 'fisico';
  }

  function splitWords(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];
    return trimmed.split(/\s+/);
  }

  function normalize(word, opts) {
    let value = String(word);
    if (!opts.caseSensitive) value = value.toLowerCase();
    if (opts.ignoreAccents) value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function showAlert(message) {
    els.appAlert.textContent = message;
    els.appAlert.hidden = false;
  }

  function hideAlert() {
    els.appAlert.hidden = true;
  }

  function setBadge(text, variant) {
    els.saveBadge.hidden = false;
    els.saveBadge.textContent = text;
    els.saveBadge.className = `badge text-bg-${variant}`;
  }

  function renderState() {
    const running = state.status === 'running';
    const hasSnippet = Boolean(state.snippet);

    els.btnStart.disabled = running || state.status === 'finished' || !hasSnippet || state.loadingText;
    els.btnCheck.disabled = !running;
    els.btnReset.disabled = state.status === 'idle';
    els.btnNew.disabled = state.loadingText;
    els.selectMinutes.disabled = running || state.status === 'finished';
    els.typingArea.disabled = !running;

    els.countdown.dataset.state = state.status;
    els.liveStatus.dataset.state = state.status;
    els.liveStatus.textContent = STATUS_LABELS[state.status];
    els.timerProgress.hidden = state.status === 'idle';
  }

  function renderClock(remainingMs) {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutesPart = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsPart = String(seconds % 60).padStart(2, '0');
    els.countdown.textContent = `${minutesPart}:${secondsPart}`;

    const totalMs = state.durationSeconds * 1000;
    const percent = totalMs > 0 ? clamp((remainingMs / totalMs) * 100, 0, 100) : 0;
    els.timerBar.style.width = `${percent}%`;
    els.timerBar.classList.toggle('low', percent < 20);
  }

  function updateLiveWords() {
    const count = splitWords(els.typingArea.value).length;
    els.liveWords.textContent = `${count} ${count === 1 ? 'palabra escrita' : 'palabras escritas'}`;
  }

  function renderReference() {
    const fragment = document.createDocumentFragment();
    state.words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.dataset.index = String(index);
      span.textContent = word;
      fragment.appendChild(span);
      fragment.appendChild(document.createTextNode(' '));
    });
    els.referenceText.replaceChildren(fragment);
  }

  function clearHighlight() {
    els.referenceText.querySelectorAll('.word').forEach((span) => {
      span.className = 'word';
    });
  }

  function applyHighlight(marks) {
    const spans = els.referenceText.querySelectorAll('.word');
    spans.forEach((span, index) => {
      span.className = marks[index] ? `word ${marks[index]}` : 'word';
    });
  }

  function renderEvaluatedOverlay(evaluated) {
    const overlay = els.resultOverlay;
    if (!overlay) return;
    const fragment = document.createDocumentFragment();
    (evaluated || []).forEach((item) => {
      if (!item || !Object.prototype.hasOwnProperty.call(item, 'is_correct')) return;
      if (item.is_correct) {
        fragment.appendChild(document.createTextNode(item.word || ''));
      } else {
        const span = document.createElement('span');
        span.className = 'word-error';
        span.textContent = item.word || '';
        fragment.appendChild(span);
      }
    });
    overlay.replaceChildren(fragment);
  }

  function renderPrintSheet() {
    els.printSheet.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = state.snippet.title;

    const meta = document.createElement('div');
    meta.className = 'print-meta';
    meta.textContent = `Práctica de dactilografía · ${state.snippet.word_count} palabras · ${formatDate(new Date().toISOString())}`;

    const content = document.createElement('div');
    content.className = 'print-content';
    content.textContent = state.snippet.content;

    els.printSheet.append(title, meta, content);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function reset() {
    stopTimer();
    state.status = 'idle';
    state.startedAt = 0;
    state.endsAt = 0;
    els.typingArea.value = '';
    els.resultsPanel.hidden = true;
    els.saveBadge.hidden = true;
    els.resultsHint.hidden = true;
    clearHighlight();
    if (els.resultOverlay) {
      els.resultOverlay.replaceChildren();
      els.resultOverlay.classList.add('d-none');
    }
    if (els.typingArea) {
      els.typingArea.classList.remove('d-none');
      els.typingArea.disabled = false;
    }
    renderClock(state.durationSeconds * 1000);
    renderState();
    updateLiveWords();
    if (els.typingArea) els.typingArea.focus();
  }

  async function loadText() {
    state.loadingText = true;
    hideAlert();
    els.snippetTitle.textContent = 'Cargando texto…';
    els.snippetMeta.textContent = '— palabras';
    els.referenceText.replaceChildren();
    renderState();

    try {
      const snippet = await window.TypingAPI.getText();
      state.snippet = snippet;
      state.words = splitWords(snippet.content);
      els.snippetTitle.textContent = snippet.title;
      els.snippetMeta.textContent = `${snippet.word_count} palabras`;
      renderReference();
      renderPrintSheet();
      reset();
    } catch (err) {
      state.snippet = null;
      state.words = [];
      els.snippetTitle.textContent = 'Sin texto disponible';
      els.snippetMeta.textContent = '— palabras';
      showAlert(err.message);
      reset();
    } finally {
      state.loadingText = false;
      renderState();
    }
  }

  function start() {
    if (!state.snippet || state.status !== 'idle') return;

    els.resultsPanel.hidden = true;
    els.saveBadge.hidden = true;
    els.resultsHint.hidden = true;
    clearHighlight();
    if (els.resultOverlay) {
      els.resultOverlay.replaceChildren();
      els.resultOverlay.classList.add('d-none');
    }
    if (els.typingArea) {
      els.typingArea.classList.remove('d-none');
      els.typingArea.disabled = false;
    }

    state.durationSeconds = Number(els.selectMinutes.value) * 60;
    state.status = 'running';
    state.startedAt = Date.now();
    state.endsAt = state.startedAt + state.durationSeconds * 1000;

    renderState();
    renderClock(state.durationSeconds * 1000);
    els.typingArea.focus();

    if (settings.hideOnStart && els.toggleShowText.checked) {
      els.toggleShowText.checked = false;
      els.practiceMain.classList.add('reference-hidden');
    }

    state.timerId = setInterval(tick, 250);
  }

  function tick() {
    const remaining = state.endsAt - Date.now();
    if (remaining <= 0) {
      renderClock(0);
      finish('time');
      return;
    }
    renderClock(remaining);
  }

  function evaluate(elapsedSeconds) {
    const typed = splitWords(els.typingArea.value);
    const total = typed.length;
    const minutes = elapsedSeconds / 60;
    const ppm = minutes > 0 ? total / minutes : 0;

    if (currentMode() === 'fisico') {
      return { total, correct: 0, marks: [], precision: 0, ppm, elapsedSeconds };
    }

    const opts = { caseSensitive: settings.caseSensitive, ignoreAccents: settings.ignoreAccents };
    const marks = [];
    let correct = 0;

    state.words.forEach((word, index) => {
      const typedWord = typed[index];
      if (typedWord === undefined) {
        marks.push('missing');
        return;
      }
      if (normalize(typedWord, opts) === normalize(word, opts)) {
        marks.push('ok');
        correct += 1;
        return;
      }
      marks.push('bad');
    });

    const precision = total > 0 ? (correct / total) * 100 : 0;
    return { total, correct, marks, precision, ppm, elapsedSeconds };
  }

  function renderResults(stats) {
    els.statCorrect.textContent = String(stats.correct);
    els.statTotal.textContent = String(stats.total);
    els.statPrecision.textContent = `${stats.precision.toFixed(1)}%`;
    els.statWpm.textContent = stats.ppm.toFixed(1);
    els.resultsPanel.hidden = false;
  }

  function applyServerResult(saved) {
    els.statCorrect.textContent = String(saved.correct_words);
    els.statTotal.textContent = String(saved.total_words_typed);
    els.statPrecision.textContent = `${Number(saved.precision_percentage).toFixed(1)}%`;
    els.statWpm.textContent = Number(saved.wpm).toFixed(1);
    if (els.resultsPanel) {
      els.resultsPanel.hidden = false;
    }
    if (saved.evaluated_text && els.resultOverlay) {
      renderEvaluatedOverlay(saved.evaluated_text);
      if (els.typingArea) {
        els.typingArea.classList.add('d-none');
      }
      els.resultOverlay.classList.remove('d-none');
    }
  }

  async function persist(stats) {
    setBadge('Guardando…', 'secondary');
    const payload = {
      mode: currentMode(),
      text_snippet: state.snippet.id,
      duration_seconds: stats.elapsedSeconds,
      text: els.typingArea.value,
    };
    if (payload.mode === 'digital') {
      payload.case_sensitive = settings.caseSensitive;
      payload.ignore_accents = settings.ignoreAccents;
    }
    try {
      const saved = await window.TypingAPI.saveResult(payload);
      applyServerResult(saved);
      setBadge(saved.passed ? 'Guardada · Aprobada' : 'Guardada', 'success');
    } catch (err) {
      setBadge('No se pudo guardar', 'danger');
      els.resultsHint.textContent = err.message;
      els.resultsHint.hidden = false;
    }
  }

  async function finish(reason) {
    if (state.status !== 'running') return;

    stopTimer();
    const now = Date.now();
    const rawSeconds = (now - state.startedAt) / 1000;
    const elapsedSeconds = reason === 'time'
      ? state.durationSeconds
      : Math.max(1, Math.round(rawSeconds));

    state.status = 'finished';
    renderState();
    renderClock(Math.max(0, state.endsAt - now));

    const stats = evaluate(elapsedSeconds);
    renderResults(stats);
    if (currentMode() === 'digital') applyHighlight(stats.marks);
    await persist(stats);
  }

  function currentPeriod() {
    const checked = document.querySelector('input[name="historyPeriod"]:checked');
    return checked ? Number(checked.value) : 30;
  }

  function hideHistoryStates() {
    els.historySummary.hidden = true;
    els.historyLoading.hidden = true;
    els.historyEmpty.hidden = true;
    els.historyError.hidden = true;
    els.historyTable.hidden = true;
  }

  function appendCell(row, text, className) {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (className) cell.className = className;
    row.appendChild(cell);
  }

  function renderHistory(data) {
    const hasResults = data.total_results > 0;
    els.historySummary.hidden = !hasResults;
    els.historyEmpty.hidden = hasResults;
    els.historyTable.hidden = !hasResults;

    if (!hasResults) {
      els.historyEmpty.textContent = `No hay prácticas registradas en los últimos ${data.period.days} días.`;
      return;
    }

    els.histTotal.textContent = String(data.total_results);
    els.histPassed.textContent = String(data.passed_count);
    els.histAvgWpm.textContent = data.averages.wpm === null ? '—' : Number(data.averages.wpm).toFixed(1);
    els.histAvgPrecision.textContent = data.averages.precision_percentage === null
      ? '—'
      : `${Number(data.averages.precision_percentage).toFixed(1)}%`;

    const fragment = document.createDocumentFragment();
    data.results.forEach((item) => {
      const row = document.createElement('tr');
      appendCell(row, formatDate(item.date));
      appendCell(row, item.text_snippet.title);
      appendCell(row, String(item.duration_minutes), 'text-end');
      appendCell(row, `${item.correct_words} / ${item.total_words_typed}`, 'text-end');
      appendCell(row, `${Number(item.precision_percentage).toFixed(1)}%`, 'text-end');
      appendCell(row, Number(item.wpm).toFixed(1), 'text-end');

      const statusCell = document.createElement('td');
      statusCell.className = 'text-center';
      const badge = document.createElement('span');
      badge.className = `badge text-bg-${item.passed ? 'success' : 'secondary'}`;
      badge.textContent = item.passed ? 'Aprobada' : 'En curso';
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      fragment.appendChild(row);
    });
    els.historyBody.replaceChildren(fragment);
  }

  async function loadHistory() {
    hideHistoryStates();
    els.historyLoading.hidden = false;
    try {
      const data = await window.TypingAPI.getStats(currentPeriod());
      els.historyLoading.hidden = true;
      renderHistory(data);
    } catch (err) {
      els.historyLoading.hidden = true;
      els.historyError.textContent = err.message;
      els.historyError.hidden = false;
    }
  }

  function fillSettingsInputs() {
    els.settingMinutes.value = String(settings.minutes);
    els.settingHideOnStart.checked = settings.hideOnStart;
    els.settingCaseSensitive.checked = settings.caseSensitive;
    els.settingIgnoreAccents.checked = settings.ignoreAccents;
  }

  function saveSettings() {
    settings = {
      minutes: Number(els.settingMinutes.value),
      hideOnStart: els.settingHideOnStart.checked,
      caseSensitive: els.settingCaseSensitive.checked,
      ignoreAccents: els.settingIgnoreAccents.checked,
    };
    persistSettings();

    els.selectMinutes.value = String(settings.minutes);
    if (state.status === 'idle') {
      state.durationSeconds = settings.minutes * 60;
      renderClock(state.durationSeconds * 1000);
    }

    const modal = window.bootstrap.Modal.getInstance(els.settingsModal);
    if (modal) modal.hide();
  }

  function toggleReference() {
    els.practiceMain.classList.toggle('reference-hidden', !els.toggleShowText.checked);
  }

  function handleSplitPointer(event) {
    if (event.type === 'pointermove' && !els.splitHandle.classList.contains('dragging')) return;
    const rect = els.practiceMain.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    els.practiceMain.style.setProperty('--split', `${clamp(percent, 28, 72)}%`);
  }

  function bindEvents() {
    els.btnStart.addEventListener('click', start);
    els.btnCheck.addEventListener('click', () => finish('manual'));
    els.btnReset.addEventListener('click', reset);
    els.btnNew.addEventListener('click', loadText);
    els.btnSaveSettings.addEventListener('click', saveSettings);

    els.typingArea.addEventListener('input', updateLiveWords);

    els.toggleShowText.addEventListener('change', toggleReference);

    els.selectMinutes.addEventListener('change', () => {
      state.durationSeconds = Number(els.selectMinutes.value) * 60;
      if (state.status === 'idle') renderClock(state.durationSeconds * 1000);
    });

    els.btnPrint.addEventListener('click', () => {
      if (!state.snippet) {
        showAlert('No hay ningún texto cargado para imprimir.');
        return;
      }
      renderPrintSheet();
      window.print();
    });

    els.settingsModal.addEventListener('show.bs.modal', fillSettingsInputs);
    els.historyModal.addEventListener('show.bs.modal', loadHistory);
    document.querySelectorAll('input[name="historyPeriod"]').forEach((radio) => {
      radio.addEventListener('change', loadHistory);
    });

    els.splitHandle.addEventListener('pointerdown', (event) => {
      els.splitHandle.setPointerCapture(event.pointerId);
      els.splitHandle.classList.add('dragging');
    });
    els.splitHandle.addEventListener('pointermove', handleSplitPointer);
    els.splitHandle.addEventListener('pointerup', (event) => {
      els.splitHandle.releasePointerCapture(event.pointerId);
      els.splitHandle.classList.remove('dragging');
    });
    els.splitHandle.addEventListener('pointercancel', () => {
      els.splitHandle.classList.remove('dragging');
    });
    els.splitHandle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = parseFloat(getComputedStyle(els.practiceMain).getPropertyValue('--split')) || 46;
      const next = clamp(current + (event.key === 'ArrowLeft' ? -3 : 3), 28, 72);
      els.practiceMain.style.setProperty('--split', `${next}%`);
    });
  }

  function init() {
    els.selectMinutes.value = String(settings.minutes);
    state.durationSeconds = settings.minutes * 60;
    bindEvents();
    renderClock(state.durationSeconds * 1000);
    renderState();
    updateLiveWords();
    loadText();
  }

  init();
})();
