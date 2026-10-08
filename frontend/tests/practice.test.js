const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const apiJs = fs.readFileSync(path.join(ROOT, 'js/api.js'), 'utf8');
const practiceJs = fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8');

const SNIPPET = {
  id: 42,
  title: 'Texto de prueba',
  content: 'uno dos tres cuatro cinco',
  word_count: 5,
};

const STATS = {
  total_results: 2,
  passed_count: 1,
  averages: { wpm: 41.8, precision_percentage: 88.3, duration_minutes: 3 },
  best: { id: 2, wpm: 55.5 },
  best_precision: { id: 2, precision_percentage: 95 },
  period: { days: 30, count: 2 },
  results: [
    {
      id: 1,
      date: '2026-10-01T10:00:00+00:00',
      duration_minutes: 3,
      correct_words: 90,
      total_words_typed: 100,
      precision_percentage: 90,
      wpm: 40,
      passed: false,
      text_snippet: { id: 42, title: 'Texto de prueba' },
    },
    {
      id: 2,
      date: '2026-10-05T10:00:00+00:00',
      duration_minutes: 4,
      correct_words: 120,
      total_words_typed: 130,
      precision_percentage: 92.3,
      wpm: 55.5,
      passed: true,
      text_snippet: { id: 43, title: 'Otro texto' },
    },
  ],
};

let failures = 0;
let postBody = null;
let postHeaders = null;
let textCalls = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(status, body) {
  return {
    ok: status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

async function main() {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:8000/',
  });
  const { window } = dom;
  const { document } = window;

  window.document.cookie = 'csrftoken=test-token';
  window.bootstrap = { Modal: { getInstance: () => ({ hide() {} }) } };

  window.fetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (url.includes('/api/stats/')) return jsonResponse(200, STATS);
    if (url.includes('/api/text/random/')) {
      textCalls += 1;
      return jsonResponse(200, SNIPPET);
    }
    if (url.includes('/api/results/') && method === 'POST') {
      postBody = JSON.parse(options.body);
      postHeaders = options.headers;
      const KNOWN = new Set(['casa', 'perro', 'hola', 'mundo']);
      let correct = 0;
      let total = 0;
      if (postBody.mode === 'fisico') {
        const words = String(postBody.text || '').toLowerCase().replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
        total = words.length;
        correct = words.filter((w) => KNOWN.has(w)).length;
      } else {
        const textTyped = String(postBody.text || '').trim();
      const typed = textTyped === '' ? [] : textTyped.split(/\s+/);
        const reference = SNIPPET.content.split(/\s+/);
        total = typed.length;
        correct = typed.reduce((n, word, i) => n + (i < reference.length && word === reference[i] ? 1 : 0), 0);
      }
      return jsonResponse(201, {
        id: 7,
        mode: postBody.mode,
        correct_words: correct,
        total_words_typed: total,
        precision_percentage: total > 0 ? Math.round((correct / total) * 10000) / 100 : 0,
        wpm: total / (postBody.duration_seconds / 60),
        passed: correct >= 100,
      });
    }
    return jsonResponse(404, { error: 'no encontrado' });
  };

  const realNow = Date.now;
  let jump = 0;
  window.Date.now = () => realNow() + jump;

  window.eval(apiJs);
  window.eval(practiceJs);

  const el = (id) => document.getElementById(id);
  const fire = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true }));

  await sleep(50);

  console.log('Carga inicial');
  check('título del texto', el('snippetTitle').textContent === 'Texto de prueba', el('snippetTitle').textContent);
  check('5 palabras renderizadas', el('referenceText').querySelectorAll('.word').length === 5);
  check('cuenta regresiva inicial 05:00', el('countdown').textContent === '05:00', el('countdown').textContent);
  check('textarea deshabilitada', el('typingArea').disabled === true);
  check('Iniciar habilitado', el('btnStart').disabled === false);
  check('Corregir deshabilitado', el('btnCheck').disabled === true);
  check('cookie CSRF presente', document.cookie.includes('csrftoken'));

  console.log('Toggle Mostrar Texto');
  el('toggleShowText').checked = false;
  fire(el('toggleShowText'), 'change');
  check('oculta el panel izquierdo', el('practiceMain').classList.contains('reference-hidden'));
  check('las palabras siguen en memoria', el('referenceText').querySelectorAll('.word').length === 5);
  el('toggleShowText').checked = true;
  fire(el('toggleShowText'), 'change');
  check('vuelve a mostrar el panel', !el('practiceMain').classList.contains('reference-hidden'));

  console.log('Selector de tiempo');
  el('selectMinutes').value = '3';
  fire(el('selectMinutes'), 'change');
  check('cuenta regresiva 03:00', el('countdown').textContent === '03:00', el('countdown').textContent);
  el('selectMinutes').value = '5';
  fire(el('selectMinutes'), 'change');

  console.log('Inicio de práctica');
  el('btnStart').click();
  check('textarea habilitada', el('typingArea').disabled === false);
  check('estado en curso', el('countdown').dataset.state === 'running');
  check('Iniciar deshabilitado', el('btnStart').disabled === true);
  check('Corregir habilitado', el('btnCheck').disabled === false);
  check('Reiniciar habilitado', el('btnReset').disabled === false);
  check('temporizador visible', el('timerProgress').hidden === false);

  console.log('Escritura en curso');
  el('typingArea').value = 'uno dos  tres  XX cinco';
  fire(el('typingArea'), 'input');
  check('contador de palabras', el('liveWords').textContent === '5 palabras escritas', el('liveWords').textContent);

  console.log('Corrección manual');
  el('btnCheck').click();
  await sleep(50);
  check('textarea bloqueada', el('typingArea').disabled === true);
  check('resultados visibles', el('resultsPanel').hidden === false);
  check('palabras correctas = 4', el('statCorrect').textContent === '4', el('statCorrect').textContent);
  check('total escritas = 5', el('statTotal').textContent === '5', el('statTotal').textContent);
  check('precisión = 80.0%', el('statPrecision').textContent === '80.0%', el('statPrecision').textContent);
  const marks = Array.from(el('referenceText').querySelectorAll('.word')).map((w) => w.className);
  check('resaltado ok/ok/ok/bad/ok', JSON.stringify(marks) === JSON.stringify(['word ok', 'word ok', 'word ok', 'word bad', 'word ok']), marks);
  check('POST enviado', Boolean(postBody), postBody);
  check('payload mode digital', postBody && postBody.mode === 'digital');
  check('payload text_snippet', postBody && postBody.text_snippet === 42);
  check('payload text', postBody && postBody.text === 'uno dos  tres  XX cinco', postBody && postBody.text);
  check('payload duration_seconds', postBody && postBody.duration_seconds === 1, postBody && postBody.duration_seconds);
  check('payload case_sensitive', postBody && postBody.case_sensitive === false);
  check('payload ignore_accents', postBody && postBody.ignore_accents === false);
  check('el cliente no envía correct_words', postBody && !('correct_words' in postBody));
  check('el cliente no envía wpm', postBody && !('wpm' in postBody));
  check('resultados aplicados del servidor', el('statWpm').textContent === '300.0', el('statWpm').textContent);
  check('precisión aplicada del servidor', el('statPrecision').textContent === '80.0%', el('statPrecision').textContent);
  check('cabecera X-CSRFToken enviada', postHeaders && postHeaders['X-CSRFToken'] === 'test-token', postHeaders);
  check('Content-Type JSON', postHeaders && postHeaders['Content-Type'] === 'application/json');

  console.log('Reiniciar');
  el('btnReset').click();
  check('resultados ocultos', el('resultsPanel').hidden === true);
  check('textarea vacía', el('typingArea').value === '');
  check('vuelve a estado en espera', el('countdown').dataset.state === 'idle');
  check('resaltado limpio', Array.from(el('referenceText').querySelectorAll('.word')).every((w) => w.className === 'word'));

  console.log('Modo físico (sin texto de referencia)');
  el('toggleShowText').checked = false;
  fire(el('toggleShowText'), 'change');
  check('oculta el panel de referencia', el('practiceMain').classList.contains('reference-hidden'));
  el('btnStart').click();
  check('arena en marcha', el('typingArea').disabled === false);
  el('typingArea').value = 'casa, hola zzzx!';
  fire(el('typingArea'), 'input');
  check('contador de palabras libre', el('liveWords').textContent === '3 palabras escritas', el('liveWords').textContent);
  el('btnCheck').click();
  await sleep(50);
  check('correctas desde el servidor = 2', el('statCorrect').textContent === '2', el('statCorrect').textContent);
  check('total desde el servidor = 3', el('statTotal').textContent === '3', el('statTotal').textContent);
  check('precisión 66.7%', el('statPrecision').textContent === '66.7%', el('statPrecision').textContent);
  check('PPM 180.0', el('statWpm').textContent === '180.0', el('statWpm').textContent);
  check('payload mode fisico', postBody && postBody.mode === 'fisico');
  check('payload text crudo', postBody && postBody.text === 'casa, hola zzzx!', postBody && postBody.text);
  check('sin opciones de normalización', postBody && !('case_sensitive' in postBody), postBody);
  check('sin resaltado de referencia', Array.from(el('referenceText').querySelectorAll('.word')).every((w) => w.className === 'word'));
  el('btnReset').click();
  el('toggleShowText').checked = true;
  fire(el('toggleShowText'), 'change');
  check('vuelve a digital', !el('practiceMain').classList.contains('reference-hidden'));

  console.log('Fin por tiempo');
  el('btnStart').click();
  check('práctica en marcha', el('typingArea').disabled === false);
  jump = 6 * 60 * 1000;
  await sleep(400);
  check('textarea bloqueada al terminar', el('typingArea').disabled === true);
  check('cuenta regresiva a 00:00', el('countdown').textContent === '00:00', el('countdown').textContent);
  check('resultados visibles', el('resultsPanel').hidden === false);
  check('duración enviada = 300s', postBody && postBody.duration_seconds === 300, postBody && postBody.duration_seconds);
  check('PPM con0 palabras escritas', el('statWpm').textContent === '0.0', el('statWpm').textContent);
  check('Iniciar sigue deshabilitado', el('btnStart').disabled === true);

  console.log('Nueva práctica');
  const callsBefore = textCalls;
  el('btnNew').click();
  await sleep(50);
  check('pide un texto nuevo', textCalls === callsBefore + 1);
  check('textarea limpia', el('typingArea').value === '');
  check('resultados ocultos', el('resultsPanel').hidden === true);

  console.log('Ajustes');
  el('settingsModal').dispatchEvent(new window.Event('show.bs.modal'));
  el('settingMinutes').value = '2';
  el('settingCaseSensitive').checked = true;
  el('btnSaveSettings').click();
  check('tiempo por defecto aplicado', el('selectMinutes').value === '2', el('selectMinutes').value);
  check('cuenta regresiva 02:00', el('countdown').textContent === '02:00', el('countdown').textContent);
  const stored = JSON.parse(window.localStorage.getItem('dactilo.practice.settings'));
  check('ajustes persistidos', stored.minutes === 2 && stored.caseSensitive === true, stored);

  console.log('Historial');
  el('historyModal').dispatchEvent(new window.Event('show.bs.modal'));
  await sleep(50);
  check('resumen visible', el('historySummary').hidden === false);
  check('total de prácticas', el('histTotal').textContent === '2', el('histTotal').textContent);
  check('aprobadas', el('histPassed').textContent === '1');
  check('PPM promedio', el('histAvgWpm').textContent === '41.8', el('histAvgWpm').textContent);
  check('filas del historial', el('historyBody').querySelectorAll('tr').length === 2);

  window.close();
  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} comprobaciones fallidas`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
