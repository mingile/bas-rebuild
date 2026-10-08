const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const copyBtn = document.getElementById("copyBtn");
const toast = document.getElementById("toast");
const progressBar = document.getElementById("progressBar");
const navLinks = [...document.querySelectorAll("#nav a")];
const blocks = [...document.querySelectorAll("main > header, main > section")];
// 하위 메뉴가 가리키는 소제목들
const subTargets = [...document.querySelectorAll("#nav a.nav-sub")]
  .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
  .filter(Boolean);

// ── 테마 ──
themeBtn.addEventListener("click", () => {
  const next = html.dataset.theme === "dark" ? "light" : "dark";
  html.dataset.theme = next;
  themeBtn.textContent = next === "dark" ? "Light mode" : "Dark mode";
});

// ── 이메일 복사 ──
copyBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").textContent.trim();
  try {
    await navigator.clipboard.writeText(email);
  } catch (e) {}
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1400);
});

// ── 섹션 등장 ──
const revealer = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
  { threshold: 0.06 },
);
document.querySelectorAll("main > section").forEach((s) => revealer.observe(s));

// ── 현재 위치 표시 + 진행 바 ──
function onScroll() {
  const scrollable = html.scrollHeight - innerHeight;
  const atEnd = scrollY >= scrollable - 4;
  let current = blocks[0].id;
  for (const b of blocks) if (b.getBoundingClientRect().top <= 140) current = b.id;
  if (atEnd) current = blocks[blocks.length - 1].id;
  // 섹션 안의 하위 메뉴(예: 관제 화면, 자동화 모듈): 지나간 소제목 중 마지막 것
  let currentSub = null;
  for (const h of subTargets) {
    if (h.closest("main > section")?.id === current && h.getBoundingClientRect().top <= 160) currentSub = h.id;
  }
  if (atEnd) currentSub = null;
  navLinks.forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    a.classList.toggle("active", id === current || id === currentSub);
  });
  progressBar.style.width = scrollable > 0 ? `${(scrollY / scrollable) * 100}%` : "0%";
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ── 라이브 데모 탭 ──
// iframe은 데모 영역이 화면에 들어올 때 처음 불러온다(첫 진입 속도 보호).
const tabs = [...document.querySelectorAll(".demo-tabs [role=tab]")];
const frame = document.getElementById("demoFrame");
const hint = document.getElementById("demoHint");
const openLink = document.getElementById("demoOpen");
let activeTab = tabs[0];
let loaded = false;

function select(tab, load = loaded) {
  activeTab = tab;
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
  hint.textContent = tab.dataset.hint;
  openLink.href = tab.dataset.src;
  // 탭에 맞는 구현 내용만 보인다(탭 순서 = 패널 번호)
  const index = String(tabs.indexOf(tab));
  document.querySelectorAll("#demoDetail .detail").forEach((d) => (d.hidden = d.dataset.panel !== index));
  if (load) {
    navigateFrame(tab.dataset.src);
    loaded = true;
  }
}

/**
 * iframe을 주소로 이동시킨다.
 * 지금 iframe에 떠 있는 문서와 경로가 같고 해시만 다르면(building.html의 건물 홈 ↔ AHU ↔ TREND)
 * 문서를 다시 불러오지 않고 해시만 바꾼다. 앱이 hashchange를 받아 화면을 바꾼다.
 * (예전처럼 about:blank를 거쳐 다시 넣으면, 해시 이동이 먼저 끝나고 about:blank가 나중에
 *  적용되는 경우가 있어 간헐적으로 흰 화면이 남았다.)
 */
function navigateFrame(src) {
  const target = new URL(src, location.href);
  try {
    const current = frame.contentWindow.location;
    if (current.origin === target.origin && current.pathname === target.pathname) {
      current.hash = target.hash;
      return;
    }
  } catch {
    // 다른 출처 문서라 접근할 수 없으면 아래에서 주소를 통째로 바꾼다
  }
  frame.src = target.href;
}
tabs.forEach((t) => t.addEventListener("click", () => select(t, true)));
document.querySelector(".demo-tabs").addEventListener("keydown", (e) => {
  const i = tabs.indexOf(activeTab);
  const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
    : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
  if (next) { next.focus(); select(next, true); }
});
select(tabs[0], false);

new IntersectionObserver((entries, obs) => {
  if (entries.some((e) => e.isIntersecting)) {
    if (!loaded) select(activeTab, true);
    obs.disconnect();
  }
}, { rootMargin: "200px" }).observe(document.getElementById("demo"));

// ── 데모 동작 ↔ 구현 내용 강조 ──
// iframe 안에서 기능을 쓰면 아래 구현 내용의 해당 항목을 잠깐 강조한다.
// 데모는 같은 출처라 iframe 문서에 직접 이벤트를 건다(앱 코드는 고치지 않는다).
// 앱 쪽 선택자(#search, .marker, .page__photo, .menubar__nav, .alarm-btn …)가 바뀌면 여기도 같이 바꿔야 한다.

/** selector에 해당하는 요소에 마우스가 "새로" 들어갈 때만 부른다(같은 요소 안에서 움직일 때는 무시). */
function onEnter(doc, selector, callback) {
  let last = null;
  doc.addEventListener("mouseover", (e) => {
    const hit = e.target.closest(selector);
    if (hit && hit !== last) callback();
    last = hit;
  });
}

/** 클릭한 곳이 selector 안이면 부른다. */
function onClickIn(doc, selector, callback) {
  doc.addEventListener("click", (e) => {
    if (e.target.closest(selector)) callback();
  });
}

// 페이지(경로 끝)별로, 구현 내용의 data-feature 이름 → 이벤트 연결
const FEATURE_TRIGGERS = {
  "/home.html": {
    // 검색창 입력·키보드 탐색, 자동완성 목록 클릭
    search: (doc, flash) => {
      const input = doc.getElementById("search");
      if (!input) return;
      input.addEventListener("input", flash);
      input.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) flash();
      });
      onClickIn(doc, ".autocomplete-items", flash);
    },
    // 마커·검색 결과 핀에 마우스를 올림
    marker: (doc, flash) => onEnter(doc, ".marker, #bldg", flash),
  },
  "/building.html": {
    // 건물 전경과 기본 정보 카드
    "building-home": (doc, flash) => onEnter(doc, ".page__photo, .info-card", flash),
    // 상단 메뉴(건물정보·AHU·MECH·EF·TREND)
    menu: (doc, flash) => onEnter(doc, ".menubar__nav", flash),
    // 알람 버튼에 마우스를 올리거나 누름, 알람 콘솔에서 확인(Ack)
    alarm: (doc, flash) => {
      onEnter(doc, ".alarm-btn", flash);
      onClickIn(doc, ".alarm-btn, .alarm-console__ack", flash);
    },
    // AHU 화면: 덕트·센서 등 상태가 없는 설비 이미지
    "ahu-layout": (doc, flash) =>
      onEnter(doc, ".ahu__svg g[data-item]:not([data-point]):not(.ahu-tag):not(.ahu-switch):not(.ahu-label)", flash),
    // AHU 화면: 팬·댐퍼·코일처럼 포인트에 따라 이미지가 바뀌는 설비
    "ahu-state": (doc, flash) => onEnter(doc, ".ahu__svg g[data-point]:not(.ahu-tag):not(.ahu-switch)", flash),
    // AHU 화면: 포인트 값 태그
    "ahu-status-color": (doc, flash) => onEnter(doc, ".ahu-tag", flash),
    // AHU 화면: 운전/정지 스위치
    "ahu-control": (doc, flash) => onClickIn(doc, ".ahu-switch", flash),
    // TREND: 차트 영역
    "trend-view": (doc, flash) => onEnter(doc, ".trend-chart", flash),
    // TREND: 설비 선택 창을 열거나 설비를 고름(여러 개 선택 = 겹쳐 보기)
    "trend-tools": (doc, flash) => onClickIn(doc, ".trend__open, .picker__item", flash),
  },
};

function flashFeature(name) {
  const item = document.querySelector(`#demoDetail [data-feature="${name}"]`);
  if (!item || item.closest("[hidden]")) return;
  item.classList.remove("flash");
  void item.offsetWidth; // 애니메이션을 처음부터 다시 시작
  item.classList.add("flash");
}

// building.html 안의 화면 이동은 해시만 바뀌어 load가 다시 일어나지 않는다.
// 그래서 문서 단위로 위임(document에 이벤트)해 두면 화면이 바뀌어도 그대로 동작한다.
frame.addEventListener("load", () => {
  let doc, path;
  try {
    doc = frame.contentDocument;
    path = frame.contentWindow.location.pathname;
  } catch {
    return; // 다른 출처 문서면 건드리지 않는다
  }
  const page = Object.keys(FEATURE_TRIGGERS).find((suffix) => path.endsWith(suffix));
  if (!doc || !page) return;
  for (const [name, attach] of Object.entries(FEATURE_TRIGGERS[page])) {
    attach(doc, () => flashFeature(name));
  }
});

// ── 외부 데모(Daily Set, 해커톤) ──
// index.html의 .ext-demo 에 data-demo-url="https://..." 만 넣으면 iframe으로 띄운다.
// 화면에 가까워졌을 때 처음 불러온다. 주소가 비어 있으면 '준비 중' 문구만 보인다.
document.querySelectorAll(".ext-demo").forEach((box) => {
  const url = box.dataset.demoUrl?.trim();
  if (!url) return;
  const frameBox = box.querySelector(".ext-demo__frame");
  const open = box.querySelector(".ext-demo__open");
  open.href = url;
  open.hidden = false;

  new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    obs.disconnect();
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = box.closest("section")?.querySelector("h2")?.textContent.trim() || "데모";
    iframe.loading = "lazy";
    frameBox.querySelector(".demo-placeholder").textContent = "데모를 불러오는 중…";
    frameBox.append(iframe);
    if (box.dataset.device === "mobile") fitDevice(frameBox, iframe);
    if (box.dataset.scrollHint) addScrollHint(frameBox, iframe, box.dataset.scrollHint);
  }, { rootMargin: "200px" }).observe(box);
});

/**
 * 휴대폰 프레임이 들어갈 폭이 모자라면 폭을 줄이는 대신 통째로 축소한다.
 * (폭을 줄이면 앱 안의 줄바꿈이 바뀌어 실제 휴대폰과 다르게 보이기 때문)
 * 축소한 만큼 높이를 늘려, 축소 후에도 프레임 높이를 꽉 채우게 한다.
 */
function fitDevice(frameBox, iframe) {
  const DEVICE_W = 460;
  const SIDE_GAP = 32; // 좌우 여백 + 테두리
  const fit = () => {
    const scale = Math.min(1, (frameBox.clientWidth - SIDE_GAP) / DEVICE_W);
    iframe.style.setProperty("--device-w", `${DEVICE_W}px`);
    iframe.style.setProperty("--device-scale", scale.toFixed(3));
    iframe.style.height = `${(frameBox.clientHeight - 40) / scale}px`;
  };
  new ResizeObserver(fit).observe(frameBox);
  fit();
}

/**
 * 데모 오른쪽 절반 위에 "스크롤해 보세요" 안내를 겹쳐 띄운다(해커톤 데모).
 * 안내는 마우스 이벤트를 통과시켜 아래 화면 조작을 막지 않는다.
 * 외부 사이트라 iframe 안의 스크롤은 알 수 없으므로, 데모 안을 클릭하거나
 * 데모 위에 마우스를 3초 올려 두면 사라지게 한다.
 */
function addScrollHint(frameBox, iframe, text) {
  const hint = document.createElement("div");
  hint.className = "scroll-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = '<span class="scroll-hint__mouse"><span class="scroll-hint__wheel"></span></span>';
  hint.append(text);
  frameBox.append(hint);

  let timer = null;
  let hovering = false;
  const dismiss = () => {
    hint.classList.add("is-hidden");
    clearTimeout(timer);
  };
  frameBox.addEventListener("mouseenter", () => {
    hovering = true;
    timer = setTimeout(dismiss, 3000);
  });
  frameBox.addEventListener("mouseleave", () => {
    hovering = false;
    clearTimeout(timer);
  });
  // iframe 안을 클릭하면 포커스가 iframe으로 옮겨간다. 창에 포커스가 없으면 blur 이벤트가
  // 오지 않으므로 주기적으로 확인한다. 사이트가 스스로 포커스를 가져가는 경우(autofocus)와
  // 구분하려고, 마우스가 데모 위에 있을 때만 사용자의 클릭으로 본다.
  const watch = setInterval(() => {
    if (hint.classList.contains("is-hidden")) return clearInterval(watch);
    if (hovering && document.activeElement === iframe) dismiss();
  }, 300);
}
