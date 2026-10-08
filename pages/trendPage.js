import { getEquipmentTree, getTrend } from '../dataSource.js';
import { createEquipmentPicker } from '../components/equipmentPicker.js';
import { createTrendChart } from '../components/trendChart.js';
import { el } from '../components/dom.js';

const MSG_IDLE = '우측 버튼으로 설비를 선택하세요';
const MSG_PENDING = '데이터 준비 중';
const MSG_FAILED = '트렌드 데이터를 불러오지 못했습니다.';

/**
 * TREND 페이지(건물 공통). contextBuildingId는 들어오기 직전의 건물로, 선택 콘솔에서 먼저 펼쳐 준다.
 * 반환: { element, destroy() }
 */
export function createTrendPage({ contextBuildingId }) {
  const chart = createTrendChart();
  const chips = el('ul', { className: 'trend__chips', attrs: { 'aria-label': '선택한 설비' } });
  const openButton = el('button', { className: 'btn trend__open', type: 'button', textContent: '설비 선택', attrs: { 'aria-haspopup': 'dialog' } });
  const picker = el('div'); // 트리를 받아오면 선택 콘솔로 교체

  let selection = [];
  let pickerControl = null;
  let seq = 0;
  let destroyed = false;
  openButton.disabled = true; // 트리를 받아오기 전에는 열 수 없다

  function renderChips() {
    chips.replaceChildren(...selection.map((s) => el('li', { className: 'chip chip--select', textContent: `${s.buildingName} › ${s.equipmentName}` })));
  }

  async function apply(next) {
    selection = next;
    renderChips();
    const mine = ++seq;
    if (selection.length === 0) {
      chart.setSeries([]);
      chart.setMessage(MSG_IDLE);
      return;
    }
    let results;
    try {
      results = await Promise.all(selection.map((s) => getTrend(s.buildingId, s.equipmentId)));
    } catch (err) {
      console.error(err);
      if (!destroyed && mine === seq) chart.setMessage(MSG_FAILED);
      return;
    }
    if (destroyed || mine !== seq) return; // 그 사이 선택이 바뀜
    const series = selection
      .map((s, i) => ({ label: `${s.buildingName} › ${s.equipmentName}`, ...results[i] }))
      .filter((s) => s.points.length > 0);
    chart.setSeries(series);
    chart.setMessage(series.length === 0 ? MSG_PENDING : null);
  }

  chart.setMessage(MSG_IDLE);
  openButton.addEventListener('click', () => pickerControl?.open(selection, contextBuildingId));

  getEquipmentTree()
    .then((tree) => {
      if (destroyed) return;
      pickerControl = createEquipmentPicker({ tree, onApply: apply });
      picker.replaceWith(pickerControl.element);
      openButton.disabled = false;
    })
    .catch((err) => {
      console.error(err);
      if (!destroyed) chart.setMessage('설비 목록을 불러오지 못했습니다.');
    });

  const element = el(
    'div',
    { className: 'page trend' },
    el('section', { className: 'trend__main' }, el('h2', { className: 'trend__title', textContent: 'TREND' }), chips, chart.element),
    el('div', { className: 'trend__side' }, openButton),
    picker,
  );

  return {
    element,
    destroy() {
      destroyed = true;
      chart.destroy();
      pickerControl?.destroy();
    },
  };
}
