// trendData.js
// 트렌드 차트용 가상 데이터 생성기 — 재구성 포트폴리오용, 모든 값은 가상이다.
// 현재 수집 포인트: SA-T(급기온도, °F)만. 각 건물의 AHU마다 샘플 10개.
//
// 값 모델 (냉방 운전 중인 일반적인 공조기 기준)
// - 급기온도 설정값: AHU마다 54~57°F 중 하나 (보통 55°F 전후)
// - 실제 값: 설정값 주변에서 천천히 오르내리는 흐름 + 작은 센서 잡음
// - 범위: 50~62°F로 제한, 소수점 첫째 자리까지
//
// 같은 건물·AHU는 새로고침해도 같은 모양의 값이 나오도록 시드 기반 난수를 쓴다.

const POINT = 'SA-T';
const UNIT = '°F';

// 문자열 → 32비트 정수 시드
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 시드 기반 난수 (0 이상 1 미만)
function seededRandom(seed) {
  let a = seed;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// AHU 하나의 SA-T 샘플 생성
function generateSaT(buildingId, ahuId, { count, intervalMin, end }) {
  const rand = seededRandom(hashString(`${buildingId}/${ahuId}/${POINT}`));
  for (let i = 0; i < 5; i++) rand(); // 비슷한 시드끼리 첫 값이 겹치지 않도록 몇 번 버린다

  const setpoint = 54 + Math.floor(rand() * 4); // 54, 55, 56, 57 중 하나
  const amplitude = 0.8 + rand() * 1.4;         // 흐름의 폭 0.8~2.2°F
  const phase = rand() * Math.PI * 2;

  const endMs = end.getTime();
  const stepMs = intervalMin * 60 * 1000;
  const samples = [];

  for (let i = 0; i < count; i++) {
    const t = new Date(endMs - (count - 1 - i) * stepMs);
    const drift = amplitude * Math.sin(phase + i * 0.6);
    const noise = (rand() - 0.5) * 0.6;          // ±0.3°F
    const value = clamp(setpoint + drift + noise, 50, 62);
    samples.push({ t: t.toISOString(), v: round1(value) });
  }

  return { setpoint, samples };
}

// 건물 JSON의 AHU 목록을 꺼낸다.
// 건물 JSON에서 AHU 목록 필드 이름이 다르면 이 함수만 고치면 된다.
function getAhuIds(building) {
  const list = building.ahus || [];
  return list.map((a) => (typeof a === 'string' ? a : a.id));
}

// 마지막 샘플 시각: 현재 시각을 interval 단위로 내림
function roundedNow(intervalMin) {
  const stepMs = intervalMin * 60 * 1000;
  return new Date(Math.floor(Date.now() / stepMs) * stepMs);
}

/**
 * 모든 건물·AHU의 SA-T 트렌드를 만든다.
 * @param {Array} buildings  건물 JSON 배열 (각 항목에 id, ahus 필요)
 * @param {Object} options   count(기본 10), intervalMin(기본 15), end(기본 현재 시각 내림)
 * @returns {Object} { [buildingId]: { [ahuId]: { point, unit, setpoint, samples: [{t, v}] } } }
 */
export function generateTrendData(buildings, options = {}) {
  const count = options.count ?? 10;
  const intervalMin = options.intervalMin ?? 15;
  const end = options.end ?? roundedNow(intervalMin);

  const result = {};
  for (const building of buildings) {
    result[building.id] = {};
    for (const ahuId of getAhuIds(building)) {
      const { setpoint, samples } = generateSaT(building.id, ahuId, { count, intervalMin, end });
      result[building.id][ahuId] = { point: POINT, unit: UNIT, setpoint, samples };
    }
  }
  return result;
}