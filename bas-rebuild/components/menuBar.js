import { el } from './dom.js';

const MENUS = [
  { key: 'info', label: '건물정보' },
  { key: 'ahu', label: 'AHU', dropdown: true },
  { key: 'mech', label: 'MECH' },
  { key: 'ef', label: 'EF' },
  { key: 'trend', label: 'TREND' },
];

/**
 * 상단 메뉴 바.
 * - hrefFor(section, item): 메뉴가 이동할 해시. 라우팅 규칙은 호출하는 쪽이 갖고 있다.
 * - onAlarmClick(): 알람 버튼 클릭
 * 반환: { element, update(route), setAlarmSummary({ active, unacked }), destroy() }
 */
export function createMenuBar({ building, mapHref, hrefFor, onAlarmClick }) {
  const closers = new AbortController(); // document 리스너를 한 번에 해제하기 위함
  const links = new Map(); // key → <a>
  const ahuLinks = new Map(); // AHU id → <a>

  const ahuButton = el('button', {
    className: 'btn btn--dropdown',
    type: 'button',
    textContent: 'AHU',
    attrs: { 'aria-expanded': 'false', 'aria-controls': 'ahu-list' },
  });
  const ahuList = el('ul', { id: 'ahu-list', className: 'dropdown__list', hidden: true });
  if (building.ahus.length === 0) {
    ahuList.append(el('li', { className: 'dropdown__empty', textContent: '등록된 AHU 없음' }));
  }
  for (const id of building.ahus) {
    const link = el('a', { href: hrefFor('ahu', id), textContent: id });
    ahuLinks.set(id, link);
    ahuList.append(el('li', {}, link));
  }
  const dropdown = el('div', { className: 'dropdown' }, ahuButton, ahuList);

  function setOpen(open) {
    ahuList.hidden = !open;
    ahuButton.setAttribute('aria-expanded', String(open));
  }
  ahuButton.addEventListener('click', () => setOpen(ahuList.hidden));
  ahuList.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!dropdown.contains(e.target)) setOpen(false);
  }, { signal: closers.signal });
  dropdown.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ahuList.hidden) return;
    setOpen(false);
    ahuButton.focus();
  });

  const nav = el('nav', { className: 'menubar__nav', attrs: { 'aria-label': '건물 메뉴' } });
  for (const menu of MENUS) {
    if (menu.dropdown) {
      nav.append(dropdown);
      continue;
    }
    const link = el('a', { className: 'btn', href: hrefFor(menu.key), textContent: menu.label });
    links.set(menu.key, link);
    nav.append(link);
  }

  const alarmButton = el('button', {
    className: 'alarm-btn alarm-btn--none',
    type: 'button',
    textContent: '알람 확인 중',
    attrs: { 'aria-haspopup': 'dialog' },
  });
  alarmButton.addEventListener('click', onAlarmClick);

  const element = el(
    'header',
    { className: 'menubar' },
    el(
      'div',
      { className: 'menubar__title' },
      el('a', { className: 'menubar__back', href: mapHref, textContent: '← 지도' }),
      el('h1', { className: 'menubar__name', textContent: building.textContent },
        el('span', { className: 'menubar__id', textContent: building.id })),
    ),
    el('div', { className: 'menubar__row' }, nav, alarmButton),
  );

  function mark(link, current) {
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  return {
    element,

    /** 현재 경로에 맞는 메뉴를 강조한다. */
    update(route) {
      for (const [key, link] of links) mark(link, key === route.section);
      for (const [id, link] of ahuLinks) mark(link, route.section === 'ahu' && id === route.item);
      ahuButton.classList.toggle('is-active', route.section === 'ahu');
      setOpen(false);
    },

    /** active: 알람 상태인 건수, unacked: 그중 확인하지 않은 건수. 색: 미확인 있음(빨강) / 모두 확인(주황) / 없음(초록) */
    setAlarmSummary({ active, unacked }) {
      let text = '알람 없음';
      if (unacked > 0) text = unacked < active ? `알람 발생 ${active}건 · 미확인 ${unacked}건` : `알람 발생 ${active}건`;
      else if (active > 0) text = `알람 발생 ${active}건 · 모두 확인`;
      alarmButton.textContent = text;
      alarmButton.classList.toggle('alarm-btn--active', unacked > 0);
      alarmButton.classList.toggle('alarm-btn--acked', active > 0 && unacked === 0);
      alarmButton.classList.toggle('alarm-btn--none', active === 0);
    },

    destroy() {
      closers.abort();
    },
  };
}
