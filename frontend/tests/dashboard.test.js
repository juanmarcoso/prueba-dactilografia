const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('dashboard.html');
const chartLib = read('vendor/chart.umd.min.js');
const apiJs = read('js/api.js');
const dashboardJs = read('js/dashboard.js');

let failures = 0;

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

const FIXTURE = [
  { daysAgo: 120, correct: 105, total: 119, precision: 88.2, wpm: 40.0 },
  { daysAgo: 60, correct: 125, total: 139, precision: 89.9, wpm: 48.0 },
  { daysAgo: 25, correct: 130, total: 139, precision: 93.5, wpm: 55.5 },
  { daysAgo: 20, correct: 110, total: 121, precision: 90.9, wpm: 50.0 },
  { daysAgo: 10, correct: 85, total: 104, precision: 81.7, wpm: 45.5 },
  { daysAgo: 5, correct: 60, total: 80, precision: 75.0, wpm: 42.0 },
];

function buildStats(days) {
  const now = Date.now();
  const inPeriod = FIXTURE.filter((item) => now - item.daysAgo * 86400000 >= now - days * 86400000);
  const toDate = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
  const passed = FIXTURE.filter((item) => item.correct >= 100).length;
  const avg = (key) => FIXTURE.reduce((sum, item) => sum + item[key], 0) / FIXTURE.length;
  const newest = FIXTURE[FIXTURE.length - 1];

  return {
    total_results: FIXTURE.length,
    passed_count: passed,
    averages: {
      wpm: avg('wpm'),
      precision_percentage: avg('precision'),
      duration_minutes: 3,
      correct_words: avg('correct'),
      total_words_typed: avg('total'),
    },
    best: { id: 3, wpm: 55.5 },
    best_precision: { id: 3, precision_percentage: 93.5 },
    max_correct_words: Math.max(...FIXTURE.map((item) => item.correct)),
    last_practice: {
      id: 6,
      date: toDate(newest.daysAgo),
      wpm: newest.wpm,
      correct_words: newest.correct,
      precision_percentage: newest.precision,
      duration_minutes: 2,
      total_words_typed: newest.total,
      passed: false,
      text_snippet_title: 'Historia breve de los ordenadores',
    },
    passed_threshold: 100,
    period: { days, start: toDate(days), count: inPeriod.length },
    results: inPeriod.map((item, index) => ({
      id: index + 1,
      date: toDate(item.daysAgo),
      duration_minutes: 3,
      correct_words: item.correct,
      total_words_typed: item.total,
      precision_percentage: item.precision,
      wpm: item.wpm,
      passed: item.correct >= 100,
      text_snippet: { id: 1, title: 'Texto de práctica' },
    })),
  };
}

function formatDate(iso, withTime) {
  const options = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: '2-digit' };
  return new Date(iso).toLocaleString('es-ES', options);
}

async function main() {
  console.log('Chart.js vendor');
  const domA = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1:8000/',
  });
  domA.window.eval(chartLib);
  check('define window.Chart', typeof domA.window.Chart === 'function', typeof domA.window.Chart);
  domA.window.close();

  console.log('Dashboard');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:8000/',
  });
  const { window } = dom;
  const { document } = window;

  const charts = [];
  window.Chart = class FakeChart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      charts.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  };

  let failNext = false;
  const requests = [];
  window.fetch = async (url) => {
    requests.push(url);
    if (failNext) throw new Error('network down');
    if (url.includes('/api/stats/')) {
      const match = url.match(/days=(\d+)/);
      return jsonResponse(200, buildStats(match ? Number(match[1]) : 30));
    }
    return jsonResponse(404, { error: 'no encontrado' });
  };

  window.eval(apiJs);
  window.eval(dashboardJs);

  const el = (id) => document.getElementById(id);
  const fire = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true }));

  await sleep(80);

  console.log('Carga inicial');
  check('loading oculto', el('dashLoading').hidden === true);
  check('tarjetas visibles', el('topCards').hidden === false && el('metricsGrid').hidden === false);
  check('gráfico visible', el('chartCard').hidden === false);
  check('tabla visible', el('tableCard').hidden === false);
  check('sin alertas', el('appAlert').hidden === true);
  check('endpoint consultado', requests.some((u) => u.includes('days=30')), requests);

  console.log('Bloques superiores');
  check('tasa de aprobación 66,7 %', el('approvalRate').textContent === '66,7 %', el('approvalRate').textContent);
  check('barra de aprobación', Math.abs(parseFloat(el('approvalBar').style.width) - 66.7) < 0.1, el('approvalBar').style.width);
  check('nota de aprobación', el('approvalNote').textContent === '4 de 6 intentos superan las 100 palabras correctas', el('approvalNote').textContent);
  check('última práctica con fecha', el('lastDate').textContent === formatDate(buildStats(30).last_practice.date, true), el('lastDate').textContent);
  check('última práctica con detalle', el('lastMeta').textContent.includes('42,0 PPM') && el('lastMeta').textContent.includes('60 palabras correctas'), el('lastMeta').textContent);

  console.log('Tarjetas de métricas');
  check('mejor resultado = 130', el('bestCorrect').textContent === '130', el('bestCorrect').textContent);
  check('precisión promedio = 86,5 %', el('avgPrecision').textContent === '86,5 %', el('avgPrecision').textContent);
  check('velocidad promedio = 46,8', el('avgWpm').textContent === '46,8', el('avgWpm').textContent);
  check('intentos totales = 6', el('totalAttempts').textContent === '6', el('totalAttempts').textContent);

  console.log('Gráfico Chart.js');
  check('una instancia creada', charts.length === 1, charts.length);
  const config = charts[0].config;
  check('tipo línea', config.type === 'line');
  check('3 datasets', config.data.datasets.length === 3);
  check('dataset 1 verde', config.data.datasets[0].borderColor === '#16a34a');
  check('dataset 2 dorado', config.data.datasets[1].borderColor === '#f59e0b');
  check('etiquetas correctas', config.data.datasets[0].label === 'Palabras bien tipeadas');
  check('etiquetas velocidad', config.data.datasets[1].label === 'Velocidad (PPM)');
  check('datos correctas cronológicos', JSON.stringify(config.data.datasets[0].data) === JSON.stringify([130, 110, 85, 60]), config.data.datasets[0].data);
  check('datos velocidad', JSON.stringify(config.data.datasets[1].data) === JSON.stringify([55.5, 50, 45.5, 42]));
  check('línea punteada en 100', config.data.datasets[2].data.length === 4 && config.data.datasets[2].data.every((v) => v === 100));
  check('estilo punteado', Array.isArray(config.data.datasets[2].borderDash));
  check('eje Y mínimo 0', config.options.scales.y.min === 0);
  check('eje Y máximo ≥ 100', config.options.scales.y.max >= 110, config.options.scales.y.max);
  check('eje Y máximo con margen', config.options.scales.y.max === 140, config.options.scales.y.max);
  check('eje X de fecha', config.options.scales.x.title.text === 'Fecha');
  check('4 puntos en el periodo 30', config.data.labels.length === 4);
  check('subtítulo del periodo', el('chartSubtitle').textContent.includes('Últimos 30 días'), el('chartSubtitle').textContent);

  console.log('Tabla de historial');
  check('4 filas', el('historyRows').querySelectorAll('tr').length === 4, el('historyRows').querySelectorAll('tr').length);
  const firstRow = el('historyRows').querySelector('tr');
  const cells = Array.from(firstRow.querySelectorAll('td')).map((td) => td.textContent);
  check('primera fila = más reciente', cells[0] === formatDate(buildStats(30).last_practice.date, true), cells[0]);
  check('columna precisión', cells[1] === '75,0 %', cells[1]);
  check('columna velocidad', cells[2] === '42,0 PPM', cells[2]);
  check('columna palabras', cells[3] === '60 / 80', cells[3]);
  const badges = Array.from(el('historyRows').querySelectorAll('tr')).map((tr) => tr.querySelector('span.badge').textContent);
  check('etiquetas Aprobado/A mejorar', JSON.stringify(badges) === JSON.stringify(['A mejorar', 'A mejorar', 'Aprobado', 'Aprobado']), badges);
  check('badge rojo de no aprobado', firstRow.querySelector('span.badge').className.includes('text-bg-danger'));
  check('conteo de filas', el('tableCount').textContent.includes('4 prácticas en los últimos 30 días'), el('tableCount').textContent);

  console.log('Filtro 90 días');
  document.getElementById('dashPeriod90').checked = true;
  fire(document.getElementById('dashPeriod90'), 'change');
  await sleep(60);
  check('segunda petición a 90', requests.some((u) => u.includes('days=90')), requests);
  check('gráfico reemplazado', charts.length === 2 && charts[0].destroyed === true);
  check('5 puntos en 90 días', charts[1].config.data.labels.length === 5, charts[1].config.data.labels.length);
  check('5 filas en la tabla', el('historyRows').querySelectorAll('tr').length === 5);
  check('subtítulo 90 días', el('chartSubtitle').textContent.includes('Últimos 90 días'));
  check('payload mantiene 3 datasets', charts[1].config.data.datasets.length === 3);

  console.log('Filtro 1 año');
  document.getElementById('dashPeriod365').checked = true;
  fire(document.getElementById('dashPeriod365'), 'change');
  await sleep(60);
  check('6 puntos en 1 año', charts[2].config.data.labels.length === 6, charts[2].config.data.labels.length);
  check('6 filas en la tabla', el('historyRows').querySelectorAll('tr').length === 6);

  console.log('Error de red');
  failNext = true;
  el('btnReload').click();
  await sleep(60);
  check('alerta visible', el('appAlert').hidden === false);
  check('mensaje de error', el('appAlert').textContent.includes('No se pudo conectar'), el('appAlert').textContent);
  check('loading oculto tras error', el('dashLoading').hidden === true);
  failNext = false;
  el('btnReload').click();
  await sleep(60);
  check('alerta oculta tras recuperar', el('appAlert').hidden === true);
  check('datos repintados', el('totalAttempts').textContent === '6');

  window.close();
  console.log(failures === 0 ? '\nTODO OK' : `\n${failures} comprobaciones fallidas`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
