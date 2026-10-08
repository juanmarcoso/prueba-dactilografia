(() => {
  const COLORS = {
    green: '#16a34a',
    greenFill: 'rgba(22, 163, 74, 0.12)',
    gold: '#f59e0b',
    goldFill: 'rgba(245, 158, 11, 0.10)',
    guide: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.18)',
  };

  const els = {
    appAlert: document.getElementById('appAlert'),
    btnReload: document.getElementById('btnReload'),
    dashLoading: document.getElementById('dashLoading'),
    topCards: document.getElementById('topCards'),
    metricsGrid: document.getElementById('metricsGrid'),
    chartCard: document.getElementById('chartCard'),
    tableCard: document.getElementById('tableCard'),
    approvalRate: document.getElementById('approvalRate'),
    approvalBar: document.getElementById('approvalBar'),
    approvalNote: document.getElementById('approvalNote'),
    lastDate: document.getElementById('lastDate'),
    lastMeta: document.getElementById('lastMeta'),
    bestCorrect: document.getElementById('bestCorrect'),
    avgPrecision: document.getElementById('avgPrecision'),
    avgWpm: document.getElementById('avgWpm'),
    totalAttempts: document.getElementById('totalAttempts'),
    chartSubtitle: document.getElementById('chartSubtitle'),
    evolutionChart: document.getElementById('evolutionChart'),
    chartEmpty: document.getElementById('chartEmpty'),
    tableCount: document.getElementById('tableCount'),
    historyRows: document.getElementById('historyRows'),
    tableEmpty: document.getElementById('tableEmpty'),
  };

  let chart = null;
  let currentPeriod = currentPeriodFromInputs();

  function currentPeriodFromInputs() {
    const checked = document.querySelector('input[name="dashPeriod"]:checked');
    return checked ? Number(checked.value) : 30;
  }

  function formatDate(iso, withTime) {
    const options = withTime
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: '2-digit' };
    return new Date(iso).toLocaleString('es-ES', options);
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString('es-ES', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function showAlert(message) {
    els.appAlert.textContent = message;
    els.appAlert.hidden = false;
  }

  function hideAlert() {
    els.appAlert.hidden = true;
  }

  function renderSummary(data) {
    const total = data.total_results || 0;
    const passed = data.passed_count || 0;
    const threshold = data.passed_threshold ?? 100;
    const rate = total > 0 ? (passed / total) * 100 : 0;

    els.approvalRate.textContent = `${formatNumber(rate, 1)} %`;
    els.approvalBar.style.width = `${rate}%`;
    els.approvalNote.textContent = total > 0
      ? `${passed} de ${total} intentos superan las ${threshold} palabras correctas`
      : 'Aún no hay prácticas registradas';

    if (data.last_practice) {
      els.lastDate.textContent = formatDate(data.last_practice.date, true);
      els.lastMeta.textContent = `${formatNumber(data.last_practice.wpm, 1)} PPM · ${data.last_practice.correct_words} palabras correctas · ${data.last_practice.text_snippet_title}`;
    } else {
      els.lastDate.textContent = 'Sin prácticas';
      els.lastMeta.textContent = 'Completa tu primera práctica para ver aquí la última actividad.';
    }

    const averages = data.averages || {};
    els.bestCorrect.textContent = data.max_correct_words ?? '—';
    els.avgPrecision.textContent = averages.precision_percentage != null
      ? `${formatNumber(averages.precision_percentage, 1)} %`
      : '—';
    els.avgWpm.textContent = averages.wpm != null ? formatNumber(averages.wpm, 1) : '—';
    els.totalAttempts.textContent = formatNumber(total, 0);
  }

  function buildChartConfig(data, results) {
    const threshold = data.passed_threshold ?? 100;
    const labels = results.map((item) => formatDate(item.date, false));
    const correctWords = results.map((item) => item.correct_words);
    const speed = results.map((item) => item.wpm);
    const peak = Math.max(...correctWords, ...speed, threshold);
    const yMax = Math.max(110, Math.ceil(peak / 10) * 10 + 10);

    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Palabras bien tipeadas',
            data: correctWords,
            borderColor: COLORS.green,
            backgroundColor: COLORS.greenFill,
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: COLORS.green,
          },
          {
            label: 'Velocidad (PPM)',
            data: speed,
            borderColor: COLORS.gold,
            backgroundColor: COLORS.goldFill,
            fill: false,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: COLORS.gold,
          },
          {
            label: `Mínimo para aprobar (${threshold})`,
            data: labels.map(() => threshold),
            borderColor: COLORS.guide,
            borderDash: [6, 6],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12 } },
          },
          tooltip: {
            callbacks: {
              title(items) {
                if (!items.length) return '';
                return formatDate(results[items[0].dataIndex].date, true);
              },
              label(context) {
                const digits = context.datasetIndex === 1 ? 1 : 0;
                return ` ${context.dataset.label}: ${formatNumber(context.parsed.y, digits)}`;
              },
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: yMax,
            ticks: { stepSize: 20 },
            title: { display: true, text: 'Palabras / PPM' },
            grid: { color: COLORS.grid },
          },
          x: {
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            title: { display: true, text: 'Fecha' },
            grid: { display: false },
          },
        },
      },
    };
  }

  function renderChart(data) {
    const results = data.results || [];
    const threshold = data.passed_threshold ?? 100;

    if (chart) {
      chart.destroy();
      chart = null;
    }

    els.chartSubtitle.textContent = `Últimos ${data.period.days} días · mínimo de ${threshold} palabras correctas para aprobar`;

    if (!results.length) {
      els.evolutionChart.hidden = true;
      els.chartEmpty.hidden = false;
      return;
    }

    if (!window.Chart) {
      els.evolutionChart.hidden = true;
      els.chartEmpty.hidden = false;
      els.chartEmpty.textContent = 'No se pudo cargar Chart.js.';
      return;
    }

    els.evolutionChart.hidden = false;
    els.chartEmpty.hidden = true;
    els.chartEmpty.textContent = 'No hay prácticas en este periodo para graficar.';
    chart = new Chart(els.evolutionChart.getContext('2d'), buildChartConfig(data, results));
  }

  function createCell(text, className) {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
  }

  function renderTable(data) {
    const results = (data.results || []).slice().reverse();
    const days = data.period.days;

    els.historyRows.replaceChildren();
    els.tableEmpty.hidden = results.length > 0;
    els.tableCount.textContent = results.length > 0
      ? `${results.length} ${results.length === 1 ? 'práctica' : 'prácticas'} en los últimos ${days} días · más recientes primero`
      : `Sin prácticas en los últimos ${days} días`;

    const fragment = document.createDocumentFragment();

    results.forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(createCell(formatDate(item.date, true)));
      row.appendChild(createCell(`${formatNumber(item.precision_percentage, 1)} %`, 'text-end'));
      row.appendChild(createCell(`${formatNumber(item.wpm, 1)} PPM`, 'text-end'));
      row.appendChild(createCell(`${item.correct_words} / ${item.total_words_typed}`, 'text-end'));

      const statusCell = document.createElement('td');
      statusCell.className = 'text-center';
      const badge = document.createElement('span');
      badge.className = `badge ${item.passed ? 'text-bg-success' : 'text-bg-danger'}`;
      badge.textContent = item.passed ? 'Aprobado' : 'A mejorar';
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      fragment.appendChild(row);
    });

    els.historyRows.appendChild(fragment);
  }

  async function load(period) {
    currentPeriod = period;
    els.dashLoading.hidden = false;

    try {
      const data = await window.TypingAPI.getStats(period);
      hideAlert();
      renderSummary(data);
      renderChart(data);
      renderTable(data);
      els.topCards.hidden = false;
      els.metricsGrid.hidden = false;
      els.chartCard.hidden = false;
      els.tableCard.hidden = false;
    } catch (err) {
      showAlert(err.message);
    } finally {
      els.dashLoading.hidden = true;
    }
  }

  function bindEvents() {
    els.btnReload.addEventListener('click', () => load(currentPeriod));

    document.querySelectorAll('input[name="dashPeriod"]').forEach((radio) => {
      radio.addEventListener('change', () => load(Number(radio.value)));
    });
  }

  function init() {
    bindEvents();
    load(currentPeriod);
  }

  init();
})();
