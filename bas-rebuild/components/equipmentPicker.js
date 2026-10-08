import { el } from './dom.js';

const keyOf = (buildingId, equipmentId) => `${buildingId}/${equipmentId}`;

/**
 * 설비 선택 콘솔(모달): 건물 → 설비 2단계 트리. 설비는 다중 선택.
 * 체크 상태는 "선택 완료"를 눌러야 반영된다. ×·Esc·바깥 클릭으로 닫으면 변경을 버린다.
 * - tree: [{ id, name, equipment: [{ id, name }] }]
 * - onApply(selection): selection = [{ buildingId, buildingName, equipmentId, equipmentName }]
 * 반환: { element, open(selection, expandedBuildingId), destroy() }
 */
export function createEquipmentPicker({ tree, onApply }) {
  const checks = new Map(); // key → { input, item }

  function setExpanded({ button, list }, expanded) {
    button.setAttribute('aria-expanded', String(expanded));
    list.hidden = !expanded;
  }

  const nodes = tree.map((building) => {
    const listId = `picker-${building.id}`;
    const button = el('button', {
      className: 'picker__toggle',
      type: 'button',
      attrs: { 'aria-expanded': 'false', 'aria-controls': listId },
    }, el('span', { className: 'picker__name', textContent: building.name }),
    el('span', { className: 'picker__count', textContent: `${building.equipment.length}개 설비` }));

    const list = el('ul', { id: listId, className: 'picker__list', hidden: true });
    for (const equipment of building.equipment) {
      const input = el('input', { type: 'checkbox' });
      const item = {
        buildingId: building.id,
        buildingName: building.name,
        equipmentId: equipment.id,
        equipmentName: equipment.name,
      };
      checks.set(keyOf(building.id, equipment.id), { input, item });
      list.append(el('li', {}, el('label', { className: 'picker__item' }, input, equipment.name)));
    }

    const toggle = { button, list };
    button.addEventListener('click', () => setExpanded(toggle, list.hidden));
    return { id: building.id, toggle, element: el('li', { className: 'picker__node' }, button, list) };
  });

  const summary = el('span', { className: 'picker__summary', attrs: { 'aria-live': 'polite' } });
  const applyButton = el('button', { className: 'btn', type: 'button', textContent: '선택 완료' });
  const closeButton = el('button', {
    className: 'dialog-close',
    type: 'button',
    textContent: '×',
    attrs: { 'aria-label': '설비 선택 닫기' },
  });

  const dialog = el(
    'dialog',
    { className: 'picker', attrs: { 'aria-labelledby': 'picker-title' } },
    el(
      'header',
      { className: 'picker__head' },
      el('div', {}, el('h2', { id: 'picker-title', textContent: '설비 선택' }),
        el('p', { className: 'picker__sub', textContent: '건물을 펼쳐 트렌드를 볼 설비를 고르세요. 여러 개 선택할 수 있습니다.' })),
      closeButton,
    ),
    el('ul', { className: 'picker__tree' }, ...nodes.map((n) => n.element)),
    el('footer', { className: 'picker__foot' }, summary, applyButton),
  );

  function selected() {
    return [...checks.values()].filter(({ input }) => input.checked).map(({ item }) => item);
  }

  function updateSummary() {
    summary.textContent = `${selected().length}개 선택`;
  }

  dialog.addEventListener('change', updateSummary);
  closeButton.addEventListener('click', () => dialog.close());
  // 백드롭을 누르면 dialog 자신이 클릭 대상이 된다(자식이 dialog 안을 채운다)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  applyButton.addEventListener('click', () => {
    onApply(selected());
    dialog.close();
  });

  return {
    element: dialog,

    /** 현재 선택을 체크 상태로 되돌려 연다. expandedBuildingId의 건물은 미리 펼친다. */
    open(selection, expandedBuildingId) {
      const keys = new Set(selection.map((s) => keyOf(s.buildingId, s.equipmentId)));
      for (const [key, { input }] of checks) input.checked = keys.has(key);
      const withSelection = new Set(selection.map((s) => s.buildingId));
      for (const node of nodes) {
        setExpanded(node.toggle, node.id === expandedBuildingId || withSelection.has(node.id));
      }
      updateSummary();
      if (!dialog.open) dialog.showModal();
    },

    destroy() {
      if (dialog.open) dialog.close();
    },
  };
}
