const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const copyBtn = document.getElementById("copyBtn");
const toast = document.getElementById("toast");
const progressBar = document.getElementById("progressBar");
const navLinks = [...document.querySelectorAll("#nav a")];
const blocks = [...document.querySelectorAll("main > header, main > section")];

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
  navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${current}`));
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
