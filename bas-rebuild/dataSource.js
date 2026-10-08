// 건물 데이터 접근 계층. 화면은 JSON을 직접 읽지 않고 이 모듈만 거친다.
// 지금은 data/buildings.json을 읽는다. 시뮬레이터나 백엔드로 바꿀 때 이 파일만 고치면 된다.

import { generateTrendData } from './trendData.js';

// 상대 경로를 유지한다. '/data/...'는 서버 루트 기준이라 배포 위치에 따라 404가 날 수 있다.
const DATA_URL = 'data/buildings.json';

// 알람 상태는 두 가지다. ALARM(알람 상태)은 다시 확인(acked)한 것과 하지 않은 것으로 나뉜다. NORMAL은 확인 여부를 따지지 않는다.
export const ALARM_STATUS = Object.freeze({ ALARM: 'alarm', NORMAL: 'normal' });

let loading = null;

function load() {
  loading ??= fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`건물 데이터 로드 실패 (${res.status})`);
      return res.json();
    })
    .then((json) => json.buildings)
    .catch((err) => {
      loading = null; // 실패한 응답을 캐시하지 않는다
      throw err;
    });
  return loading;
}

/** 건물 id(예: 'B00101')로 건물 정보를 찾는다. 없으면 null. */
export async function getBuilding(id) {
  const buildings = await load();
  return buildings.find((b) => b.id === id) ?? null;
}

/** 건물의 알람 목록. 발생 시각 최신순. 알람: { id, time, equipment, message, status, acked } */
export async function getAlarms(id) {
  const building = await getBuilding(id);
  return (building?.alarms ?? []).map((a) => ({ ...a })).sort((x, y) => y.time.localeCompare(x.time));
}

/** 알람 버튼 표시용 요약. active는 알람 상태인 건수, unacked는 그중 아직 확인하지 않은 건수. */
export async function getAlarmSummary(id) {
  const alarms = await getAlarms(id);
  const active = alarms.filter((a) => a.status === ALARM_STATUS.ALARM);
  return {
    active: active.length,
    unacked: active.filter((a) => !a.acked).length,
    total: alarms.length,
  };
}

/**
 * 알람을 확인(acknowledge)한다. 알람 상태인 알람만 대상이고, 이미 확인했으면 그대로 둔다.
 * 반환: 확인한 알람의 사본. 알람이 없거나 알람 상태가 아니면 null.
 * 확인 결과는 페이지를 새로 열면 사라진다(지금은 메모리에만 반영).
 */
export async function acknowledgeAlarm(buildingId, alarmId) {
  const building = await getBuilding(buildingId);
  const alarm = building?.alarms?.find((a) => a.id === alarmId);
  if (!alarm || alarm.status !== ALARM_STATUS.ALARM) return null;
  alarm.acked = true;
  return { ...alarm };
}

// ── AHU ───────────────────────────────────────────────────────────────

// 모든 건물의 모든 AHU가 같은 배치를 쓴다. AHU마다 배치를 달리하려면 아래 getAhuLayout에서 URL만 고르면 된다.
const AHU_LAYOUT_URL = 'layouts/ahu-default.json';
const AHU_ASSETS_URL = 'layouts/assets.json';

const jsonCache = new Map();

function loadJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(
      url,
      fetch(url, { cache: 'no-cache' }) // 배치 JSON을 고친 뒤 새로고침하면 바로 반영되도록 매번 서버에 확인한다
        .then((res) => {
          if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
          return res.json();
        })
        .catch((err) => {
          jsonCache.delete(url); // 실패한 응답을 캐시하지 않는다
          throw err;
        }),
    );
  }
  return jsonCache.get(url);
}

/**
 * AHU 화면 배치. 에셋 카탈로그를 합쳐 돌려준다.
 * 반환: { canvas: { width, height }, items: [...], assets: { [key]: { src, width, height } } }
 * 항목 형식은 layouts/README.md 참고.
 */
export async function getAhuLayout(buildingId, ahuId) {
  const [layout, assets] = await Promise.all([loadJson(AHU_LAYOUT_URL), loadJson(AHU_ASSETS_URL)]);
  return { ...layout, assets };
}

// ── TREND ─────────────────────────────────────────────────────────────

// 건물 JSON에는 AHU 목록만 있다. MECH와 EF는 메뉴 바와 같이 건물당 하나의 페이지로 취급한다.
const SINGLE_EQUIPMENT = Object.freeze(['MECH', 'EF']);

/**
 * 트렌드 설비 선택용 목록: 건물 → 설비. JSON의 건물 순서를 따른다.
 * 반환: [{ id: 'B00101', name: 'Admin Building', equipment: [{ id: 'AHU-1', name: 'AHU-1' }, ...] }]
 */
export async function getEquipmentTree() {
  const buildings = await load();
  return buildings.map((b) => ({
    id: b.id,
    name: b.textContent,
    equipment: [...b.ahus, ...SINGLE_EQUIPMENT].map((id) => ({ id, name: id })),
  }));
}

/**
 * 설비의 트렌드. 시계열 점은 차트가 그대로 그리는 { x: 시각(ms), y: 값 } 형식이다.
 * 반환: { point: 'SA-T', unit: '°F', points: [{ x, y }, ...] }
 * 데이터가 없는 설비(수집 포인트가 없는 MECH·EF, 없는 건물)는 points가 빈 배열이다.
 */
export async function getTrend(buildingId, equipmentId) {
  const building = await getBuilding(buildingId);
  const trend = building ? generateTrendData([building])[buildingId]?.[equipmentId] : undefined;
  if (!trend) return { point: null, unit: null, points: [] };
  return {
    point: trend.point,
    unit: trend.unit,
    points: trend.samples.map(({ t, v }) => ({ x: Date.parse(t), y: v })),
  };
}
