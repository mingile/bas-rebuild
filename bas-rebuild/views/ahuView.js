import { getAhuLayout } from '../dataSource.js';
import { el, svg } from '../components/dom.js';
import { createPointStore, formatPoint } from '../points.js';
import { startAhuRuntime } from '../ahuRuntime.js';

const TAG = { width: 112, height: 30 };
const SWITCH = { width: 112, height: 34, buttonWidth: 62, buttonHeight: 22 };
const NO_VALUE = '--'; // 포인트가 연결되지 않은 태그에 보이는 자리표시
const WRITABLE_ROLES = new Set(['command', 'setpoint']); // 화면에서 값을 바꿀 수 있는 포인트 종류

// ── 포인트 연결 ───────────────────────────────────────────────────────

/** states 규칙: value 이상(min)인 항목 중 마지막 것의 에셋 키. 해당 항목이 없으면 null. */
function resolveState(states, value) {
  let key = null;
  for (const state of states) {
    if (value >= state.min) key = state.asset;
  }
  return key;
}

/**
 * 배치 항목의 포인트가 바뀔 때마다 apply(value, def)를 부른다. 지금 값으로도 한 번 부른다.
 * 배치에 적힌 포인트가 저장소에 없으면 그 항목만 연결하지 않고 경고한다.
 */
function bindPoint(ctx, item, apply) {
  try {
    const def = ctx.points.definition(item.point);
    apply(ctx.points.get(item.point).value, def);
    ctx.unsubscribes.push(ctx.points.subscribe(item.point, ({ value }) => apply(value, def)));
  } catch (err) {
    console.warn(`배치 '${item.id}': ${err.message}`);
  }
}

// ── 배치 항목 → SVG ───────────────────────────────────────────────────

/** 에셋 이미지. 크기는 w만 주면 비율대로, w·h를 모두 주면 그 크기로 맞춘다. point와 states가 있으면 값에 따라 이미지를 바꾼다. */
function assetNode(item, ctx) {
  const def = ctx.assets[item.asset];
  if (!def) {
    console.warn(`배치 '${item.id}': 에셋 '${item.asset}'이 카탈로그에 없습니다.`);
    return null;
  }
  const w = item.w ?? def.width;
  const h = item.h ?? (w * def.height) / def.width;
  const transforms = [`translate(${item.x} ${item.y})`];
  if (item.rotate) transforms.push(`rotate(${item.rotate} ${w / 2} ${h / 2})`);
  if (item.flipX) transforms.push(`translate(${w} 0) scale(-1 1)`);

  const group = svg('g', { transform: transforms.join(' '), 'data-item': item.id });
  const image = svg('image', { href: def.src, width: w, height: h, preserveAspectRatio: 'none' });
  group.append(image);

  if (item.point) {
    group.dataset.point = item.point;
    if (item.states) {
      bindPoint(ctx, item, (value) => {
        const src = ctx.assets[resolveState(item.states, value) ?? item.asset]?.src;
        if (src && image.getAttribute('href') !== src) image.setAttribute('href', src);
      });
    }
  }
  return group;
}

/** 값 표시 태그: 포인트 이름과 현재 값. */
function tagNode(item, ctx) {
  const { width, height } = TAG;
  const group = svg('g', { class: 'ahu-tag', transform: `translate(${item.x} ${item.y})`, 'data-item': item.id });
  const value = svg('text', { class: 'ahu-tag__value', x: width - 8, y: height / 2, 'text-anchor': 'end' }, NO_VALUE);
  group.append(
    svg('rect', { width, height, rx: 6 }),
    svg('text', { class: 'ahu-tag__label', x: 8, y: height / 2 }, item.label ?? item.point ?? ''),
    value,
  );
  if (item.point) {
    value.dataset.point = item.point;
    bindPoint(ctx, item, (v, def) => {
      value.textContent = formatPoint(def, v);
    });
  }
  return group;
}

/**
 * 명령 박스: 포인트 이름과 켜기/끄기 버튼. 버튼에는 지금 값의 문구(labels)가 보이고, 누르면 0 ↔ 1로 바뀐다.
 * 값을 쓸 수 있는 포인트(command, setpoint)만 연결한다. 값이 설비에 반영되는 것은 다음 주기다.
 */
function switchNode(item, ctx) {
  const { width, height, buttonWidth, buttonHeight } = SWITCH;
  const label = item.label ?? item.point ?? '';
  const group = svg('g', { class: 'ahu-switch', transform: `translate(${item.x} ${item.y})`, 'data-item': item.id });
  const text = svg('text', { x: buttonWidth / 2, y: buttonHeight / 2 }, NO_VALUE);
  const button = svg(
    'g',
    {
      class: 'ahu-switch__btn',
      transform: `translate(${width - buttonWidth - 6} ${(height - buttonHeight) / 2})`,
      role: 'switch',
      tabindex: 0,
      'aria-label': `${label} 명령`,
      'aria-checked': 'false',
    },
    svg('rect', { width: buttonWidth, height: buttonHeight, rx: buttonHeight / 2 }),
    text,
  );
  group.append(
    svg('rect', { class: 'ahu-switch__box', width, height, rx: 6 }),
    svg('text', { class: 'ahu-switch__label', x: 8, y: height / 2 }, label),
    button,
  );
  if (!item.point) return group;

  group.dataset.point = item.point;
  bindPoint(ctx, item, (value, def) => {
    text.textContent = formatPoint(def, value);
    button.setAttribute('aria-checked', String(value >= 1));
    button.classList.toggle('is-on', value >= 1);
  });

  if (WRITABLE_ROLES.has(ctx.points.definition(item.point).role)) {
    const toggle = () => ctx.points.set(item.point, ctx.points.get(item.point).value >= 1 ? 0 : 1);
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    });
  } else {
    console.warn(`배치 '${item.id}': ${item.point}는 화면에서 바꿀 수 없는 포인트입니다.`);
    button.setAttribute('aria-disabled', 'true');
  }
  return group;
}

function labelNode(item) {
  return svg('text', { class: 'ahu-label', x: item.x, y: item.y, 'data-item': item.id }, item.text);
}

const RENDERERS = { asset: assetNode, tag: tagNode, switch: switchNode, label: labelNode };

function renderItem(item, ctx) {
  const render = RENDERERS[item.kind];
  if (!render) {
    console.warn(`배치 '${item.id}': 알 수 없는 kind '${item.kind}'`);
    return null;
  }
  return render(item, ctx);
}

function renderDiagram({ canvas, items }, ctx, title) {
  const root = svg('svg', {
    class: 'ahu__svg',
    viewBox: `0 0 ${canvas.width} ${canvas.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': `${title} 계통도`,
  });
  // 배열 순서가 그리는 순서(위에 올라오는 순서)다.
  for (const item of items) {
    const node = renderItem(item, ctx);
    if (node) root.append(node);
  }
  return root;
}

// ── 페이지 ────────────────────────────────────────────────────────────

/**
 * AHU 페이지. 모든 건물의 모든 AHU가 이 페이지 하나로 들어오고, 모양은 배치 JSON이 정한다.
 * points는 이 AHU의 포인트 저장소다. 넘기지 않으면 초기값으로 새로 만들고 주기 실행(시뮬레이터 → 제어 로직)도 함께 시작한다.
 * 저장소를 넘기면 그쪽에서 값을 움직이는 것으로 보고 주기 실행은 하지 않는다.
 * 반환: { element, destroy() }
 */
export function createAhuView({ building, ahuId, points: given }) {
  const points = given ?? createPointStore();
  const stopRuntime = given ? null : startAhuRuntime(points);
  const stage = el('div', { className: 'ahu__stage' }, el('p', { className: 'ahu__status', textContent: '계통도를 불러오는 중' }));
  const element = el(
    'div',
    { className: 'page ahu' },
    el('header', { className: 'ahu__head' }, el('h2', { textContent: ahuId }), el('span', { textContent: `${building.textContent} 공조기 계통도` })),
    stage,
  );

  const unsubscribes = [];
  let destroyed = false;
  getAhuLayout(building.id, ahuId)
    .then((layout) => {
      if (destroyed) return;
      const ctx = { assets: layout.assets, points, unsubscribes };
      stage.replaceChildren(renderDiagram(layout, ctx, `${building.textContent} ${ahuId}`));
    })
    .catch((err) => {
      console.error(err);
      if (!destroyed) stage.replaceChildren(el('p', { className: 'ahu__status', textContent: '계통도 배치를 불러오지 못했습니다.' }));
    });

  return {
    element,
    destroy() {
      destroyed = true;
      stopRuntime?.();
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes.length = 0;
    },
  };
}
