import { el } from './dom.js';

// 차트 라이브러리는 TREND 페이지에 들어올 때만 내려받는다.
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm';

// 어두운 배경용 범주형 색(순서 고정). 설비 선택 순서대로 배정한다.
const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

let chartLib = null;
function loadChartJs() {
  chartLib ??= import(CHART_JS_URL)
    .then((mod) => {
      mod.Chart.register(...mod.registerables);
      return mod.Chart;
    })
    .catch((err) => {
      chartLib = null; // 실패한 로드를 캐시하지 않는다
      throw err;
    });
  return chartLib;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 빈 차트의 기본 축 범위. 데이터가 들어오면 데이터에 맞춘다.
const EMPTY_X = { min: 0, max: 24, title: '시간' };
const EMPTY_Y = { min: 0, max: 100, title: '값' };

const formatTime = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function axis(title, grid, extra = {}) {
  return {
    type: 'linear',
    title: { display: true, text: title },
    grid: { color: grid },
    border: { color: grid },
    ...extra,
  };
}

/** 모든 계열이 같은 포인트·단위면 "SA-T (°F)", 섞여 있으면 "값". 축은 하나만 쓴다. */
function valueAxisTitle(series) {
  const kinds = new Set(series.map((s) => `${s.point} (${s.unit})`));
  return kinds.size === 1 ? [...kinds][0] : EMPTY_Y.title;
}

/** 점 사이의 가장 짧은 간격(ms). 눈금을 샘플 시각에 맞추는 데 쓴다. */
function sampleInterval(series) {
  let step = Infinity;
  for (const { points } of series) {
    for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].x - points[i - 1].x);
  }
  return Number.isFinite(step) && step > 0 ? step : undefined;
}

/**
 * 꺾은선 차트 영역. 데이터가 없으면 축과 격자만 그리고 위에 안내 문구를 얹는다.
 * 시리즈: { label, point, unit, points: [{ x: 시각(ms), y }] }. 비어 있으면 빈 차트로 되돌린다.
 * 반환: { element, setMessage(text|null), setSeries(series), destroy() }
 */
export function createTrendChart() {
  const canvas = el('canvas', { attrs: { role: 'img', 'aria-label': '트렌드 꺾은선 차트' } });
  const message = el('p', { className: 'trend-chart__message', hidden: true });
  const element = el('div', { className: 'trend-chart' }, el('div', { className: 'trend-chart__canvas' }, canvas), message);

  let chart = null;
  let pendingSeries = [];
  let hasData = false;
  let destroyed = false;

  loadChartJs()
    .then((Chart) => {
      if (destroyed) return;
      const text = cssVar('--muted');
      const grid = cssVar('--line');
      Chart.defaults.color = text;
      chart = new Chart(canvas, {
        type: 'line',
        data: { datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          elements: { line: { borderWidth: 2 }, point: { radius: 3, hoverRadius: 5 } },
          interaction: { mode: 'index', intersect: false }, // 점에 정확히 올리지 않아도 가장 가까운 시각의 값을 보여 준다
          scales: {
            x: axis(EMPTY_X.title, grid, { min: EMPTY_X.min, max: EMPTY_X.max }),
            y: axis(EMPTY_Y.title, grid, { min: EMPTY_Y.min, max: EMPTY_Y.max }),
          },
          plugins: {
            legend: { labels: { color: cssVar('--text') } },
            tooltip: {
              callbacks: {
                title: (items) => (hasData ? formatTime(items[0].parsed.x) : ''),
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${ctx.dataset.unit ?? ''}`,
              },
            },
          },
        },
      });
      applySeries();
    })
    .catch((err) => {
      console.error(err);
      if (!destroyed) setMessage('차트 라이브러리를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
    });

  function applySeries() {
    if (!chart) return;
    hasData = pendingSeries.some((s) => s.points.length > 0);
    chart.data.datasets = pendingSeries.map((s, i) => ({
      label: s.label,
      unit: s.unit,
      data: s.points,
      borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
      backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
    }));

    const { x, y } = chart.options.scales;
    if (hasData) {
      const xs = pendingSeries.flatMap((s) => s.points.map((p) => p.x));
      x.min = Math.min(...xs);
      x.max = Math.max(...xs);
      x.title.text = '시각';
      x.ticks.stepSize = sampleInterval(pendingSeries);
      x.ticks.callback = (value) => formatTime(value);
      y.min = undefined; // 값 범위에 맞춘다
      y.max = undefined;
      y.title.text = valueAxisTitle(pendingSeries);
    } else {
      x.min = EMPTY_X.min;
      x.max = EMPTY_X.max;
      x.title.text = EMPTY_X.title;
      x.ticks.stepSize = undefined;
      x.ticks.callback = undefined;
      y.min = EMPTY_Y.min;
      y.max = EMPTY_Y.max;
      y.title.text = EMPTY_Y.title;
    }
    chart.update();
  }

  function setMessage(text) {
    message.hidden = !text;
    message.textContent = text ?? '';
  }

  return {
    element,
    setMessage,

    setSeries(series) {
      pendingSeries = series;
      applySeries();
    },

    destroy() {
      destroyed = true;
      chart?.destroy();
      chart = null;
    },
  };
}
