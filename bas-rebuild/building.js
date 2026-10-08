import { acknowledgeAlarm, getAlarmSummary, getAlarms, getBuilding } from './dataSource.js';
import { createAlarmConsole } from './components/alarmConsole.js';
import { el } from './components/dom.js';
import { createMenuBar } from './components/menuBar.js';
import { createTrendPage } from './pages/trendPage.js';
import { createAhuView } from './views/ahuView.js';

const MAP_URL = 'home.html';
const NOTICE = '※ 실제 시스템이 아닌 이해를 돕기 위한 재구성이며, 모든 데이터와 이미지는 가상입니다.';
const PLACEHOLDER_TITLES = { mech: 'MECH', ef: 'EF' };
const LAST_BUILDING_KEY = 'lastBuildingId';

const app = document.getElementById('app');
let current = null; // { buildingId, menuBar, alarmConsole, pageSlot, disposePage }
let lastBuildingId = null; // TREND처럼 건물에 속하지 않은 페이지의 메뉴 바가 보여 줄 직전 건물
let renderSeq = 0;

// ── 라우팅: #/building/101[/section[/item]], #/trend ───────────────────
// 건물 번호는 id의 숫자 부분(B00101 → 101). section이 없으면 건물 홈(info).
// TREND는 건물 공통 페이지(#/trend)라 건물 id가 주소에 없다. 직전에 보던 건물을 기억해 메뉴 바에 보여 준다.

function rememberBuilding(id) {
  lastBuildingId = id;
  try {
    sessionStorage.setItem(LAST_BUILDING_KEY, id);
  } catch {
    // 저장소를 쓸 수 없으면 메모리 값만 쓴다(새로고침하면 잃는다)
  }
}

function recallBuilding() {
  if (lastBuildingId) return lastBuildingId;
  try {
    return sessionStorage.getItem(LAST_BUILDING_KEY);
  } catch {
    return null;
  }
}

function parseRoute(hash) {
  const [, root, token, section, item] = hash.replace(/^#/, '').split('/');
  if (root === 'trend') return { buildingId: null, section: 'trend' };
  if (root !== 'building' || !/^\d{1,5}$/.test(token ?? '')) return null;
  try {
    return {
      buildingId: `B${token.padStart(5, '0')}`,
      section: section || 'info',
      item: item ? decodeURIComponent(item) : undefined,
    };
  } catch {
    return null; // 잘못된 % 인코딩
  }
}

function hashFor(buildingId, section = 'info', item) {
  if (section === 'trend') return '#/trend';
  const base = `#/building/${Number(buildingId.slice(1))}`;
  if (section === 'info') return base;
  return item ? `${base}/${section}/${encodeURIComponent(item)}` : `${base}/${section}`;
}

// ── 페이지 ────────────────────────────────────────────────────────────

const INFO_ROWS = [
  ['용도', (b) => b.info.usage],
  ['규모', (b) => `지상 ${b.info.floors}층`],
  ['연면적', (b) => `${b.info.grossArea.toLocaleString('ko-KR')} ㎡`],
  ['준공', (b) => `${b.info.builtYear}년`],
  ['공조기', (b) => `AHU ${b.ahus.length}대`],
];

/** 건물 홈: 전경 이미지 위에 기본 정보 카드를 얹는다. */
function infoPage(building) {
  const rows = INFO_ROWS.flatMap(([label, value]) => [
    el('dt', { textContent: label }),
    el('dd', { textContent: value(building) }),
  ]);
  return el(
    'div',
    { className: 'page' },
    el('img', {
      className: 'page__photo',
      src: building.photo,
      alt: `${building.textContent} 전경 (가상 일러스트)`,
    }),
    el('section', { className: 'info-card' }, el('h2', { textContent: '기본 정보' }), el('dl', {}, ...rows)),
  );
}

/** 페이지: { element, destroy? }. destroy는 페이지가 교체될 때 호출된다. */
const plain = (element) => ({ element });

/** 아직 내용이 없는 페이지. 건물 홈으로 돌아오는 링크만 둔다. */
function messagePage(building, { title, message }) {
  return el(
    'div',
    { className: 'page page--message' },
    el('p', { className: 'page__eyebrow', textContent: building.textContent }),
    el('h2', { textContent: title }),
    el('p', { textContent: message }),
    el('a', { className: 'btn', href: hashFor(building.id), textContent: '← 건물 홈으로 돌아가기' }),
  );
}

function pageFor(building, route) {
  const { section, item } = route;
  if (section === 'info') return plain(infoPage(building));
  if (section === 'trend') return createTrendPage({ contextBuildingId: building.id });
  if (section === 'ahu' && building.ahus.includes(item)) {
    return createAhuView({ building, ahuId: item });
  }
  if (Object.hasOwn(PLACEHOLDER_TITLES, section)) {
    return plain(messagePage(building, { title: PLACEHOLDER_TITLES[section], message: '준비 중인 페이지입니다.' }));
  }
  return plain(messagePage(building, { title: '페이지를 찾을 수 없습니다', message: '주소를 확인해 주세요.' }));
}

function titleFor(building, route) {
  const name = route.section === 'ahu'
    ? route.item
    : route.section === 'trend'
      ? 'TREND'
      : Object.hasOwn(PLACEHOLDER_TITLES, route.section) ? PLACEHOLDER_TITLES[route.section] : undefined;
  return [name, building.textContent].filter(Boolean).join(' · ') + ' - 공조 관제 재구성';
}

// ── 화면 조립 ─────────────────────────────────────────────────────────

/** 건물이 바뀔 때만 메뉴 바·알람 콘솔·페이지 영역을 새로 만든다. 페이지 이동은 pageSlot만 교체한다. */
function mountShell(building) {
  current?.disposePage?.();
  current?.menuBar.destroy();

  const alarmConsole = createAlarmConsole({
    building,
    onAcknowledge: async (alarmId) => {
      await acknowledgeAlarm(building.id, alarmId);
      await refreshAlarms();
    },
  });
  const menuBar = createMenuBar({
    building,
    mapHref: MAP_URL,
    hrefFor: (section, item) => hashFor(building.id, section, item),
    onAlarmClick: refreshAlarms,
  });

  /** 알람 목록을 다시 받아 콘솔(열려 있으면 갱신, 닫혀 있으면 열기)과 메뉴 바 버튼에 반영한다. */
  async function refreshAlarms() {
    const [alarms, summary] = await Promise.all([getAlarms(building.id), getAlarmSummary(building.id)]);
    if (current?.alarmConsole !== alarmConsole) return; // 그 사이 다른 건물로 이동함
    alarmConsole.open(alarms);
    menuBar.setAlarmSummary(summary);
  }
  const pageSlot = el('div', { className: 'page-slot' });
  const content = el('main', { className: 'content' }, pageSlot, el('p', { className: 'notice', textContent: NOTICE }));

  app.replaceChildren(el('div', { className: 'shell' }, menuBar.element, content, alarmConsole.element));
  current = { buildingId: building.id, menuBar, alarmConsole, pageSlot, disposePage: null };

  getAlarmSummary(building.id).then((summary) => {
    if (current?.menuBar === menuBar) menuBar.setAlarmSummary(summary);
  });
}

function showMessage(title, message) {
  current?.disposePage?.();
  current?.menuBar.destroy();
  current = null;
  document.title = `${title} - 공조 관제 재구성`;
  app.replaceChildren(
    el(
      'div',
      { className: 'page page--message page--standalone' },
      el('h1', { textContent: title }),
      el('p', { textContent: message }),
      el('a', { className: 'btn', href: MAP_URL, textContent: '← 지도로 돌아가기' }),
    ),
  );
}

async function render() {
  const seq = ++renderSeq;
  const route = parseRoute(location.hash);
  if (!route) return showMessage('건물을 찾을 수 없습니다', '지도에서 건물을 선택해 주세요.');

  // 공통 페이지(TREND)는 직전에 보던 건물을 메뉴 바에 쓴다
  const buildingId = route.buildingId ?? recallBuilding();
  if (!buildingId) return showMessage('건물을 선택해 주세요', 'TREND는 지도에서 건물을 선택해 들어온 뒤 메뉴에서 열 수 있습니다.');

  let building;
  try {
    building = await getBuilding(buildingId);
  } catch (err) {
    console.error(err);
    if (seq !== renderSeq) return;
    return showMessage('데이터를 불러오지 못했습니다', 'file:// 이 아니라 로컬 서버로 실행했는지 확인해 주세요.');
  }
  if (seq !== renderSeq) return; // 그 사이 다른 경로로 이동함
  if (!building) return showMessage('건물을 찾을 수 없습니다', '지도에서 건물을 선택해 주세요.');

  if (route.buildingId) rememberBuilding(building.id);
  if (current?.buildingId !== building.id) mountShell(building);
  current.menuBar.update(route);
  current.disposePage?.();
  const page = pageFor(building, route);
  current.disposePage = page.destroy ?? null;
  current.pageSlot.replaceChildren(page.element);
  document.title = titleFor(building, route);
}

window.addEventListener('hashchange', render);
render();
