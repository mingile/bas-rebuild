// AHU 포인트 목록과 값 저장소. 화면은 값을 직접 만들지 않고 여기서 읽고, 값이 바뀌면 구독으로 알림을 받는다.
// 값을 쓰는 쪽(시뮬레이터, 제어 로직, 운전 명령)은 set()만 부른다. 누가 어떤 포인트를 쓰는지는 role로 구분한다.
//
// role: 'sensor'   시뮬레이터가 쓴다(센서 값)
//       'status'   시뮬레이터가 쓴다(설비 상태 피드백)
//       'output'   제어 로직이 쓴다(밸브·댐퍼 개도, 환기팬 명령)
//       'setpoint' 사용자가 바꾼다(설정값)
//       'command'  사용자가 바꾼다(운전/정지 명령)
//
// value는 화면 확인용 고정 스냅샷(냉방 운전 중)이다. 시뮬레이터가 붙으면 매 주기 덮어쓴다.
// 이진 포인트(팬, 감지기)는 0/1이고, labels가 화면에 보일 문구다. 배치 JSON의 states(min 규칙)와 같은 값 체계를 쓴다.

const RUN_STOP = { 0: 'STOP', 1: 'START' };
const OK_ALARM = { 0: 'OK', 1: 'ALARM' };
const OPEN = {0: 'CLOSE', 1:'OPEN'};

export const POINT_DEFS = Object.freeze([
  // 센서
  { name: 'OA-T', label: '외기온도', role: 'sensor', unit: '°F', value: 84.0 },
  { name: 'MA-T', label: '혼합공기온도', role: 'sensor', unit: '°F', value: 77.0 },
  { name: 'SA-T', label: '급기온도', role: 'sensor', unit: '°F', value: 55.2 },
  { name: 'SA-F', label: '급기풍량', role: 'sensor', unit: 'CFM', value: 9000 },
  { name: 'RA-T', label: '환기온도', role: 'sensor', unit: '°F', value: 76.0 },
  { name: 'RA-H', label: '환기습도', role: 'sensor', unit: '%RH', value: 48.0 },
  { name: 'FRZ', label: '동결 감지', role: 'sensor', labels: OK_ALARM, value: 0 },
  { name: 'SA-SMK', label: '급기 연기 감지', role: 'sensor', labels: OK_ALARM, value: 0 },

  // 설비 상태
  { name: 'SF-S', label: '급기팬 상태', role: 'status', labels: RUN_STOP, value: 1 },
  { name: 'RF-S', label: '환기팬 상태', role: 'status', labels: RUN_STOP, value: 0 },

  // 제어 출력
  { name: 'RF-C', label: '환기팬 명령', role: 'output', labels: RUN_STOP, value: 0 },
  { name: 'HC-V', label: '온수 밸브 개도', role: 'output', unit: '%', value: 0 },
  { name: 'CC-V', label: '냉수 밸브 개도', role: 'output', unit: '%', value: 42 },
  { name: 'OA-D', label: '외기 댐퍼 상태', role: 'output', labels: OPEN, value: 1 },
  { name: 'EA-D', label: '배기 댐퍼 상태', role: 'output', labels: OPEN, value: 0 },

  // 설정값·운전 명령
  { name: 'SA-T-SP', label: '급기온도 설정값', role: 'setpoint', unit: '°F', value: 55.0 },
  { name: 'SF-C', label: '급기팬 명령', role: 'command', labels: RUN_STOP, value: 1 },
]);

export const POINT_STATUS = Object.freeze({ OK: 'ok', ALARM: 'alarm', FAULT: 'fault' });

/** 화면에 보일 문구. 값이 없으면 '--'. 이진 포인트는 labels, 나머지는 소수 첫째 자리 + 단위. */
export function formatPoint(def, value) {
  if (value == null || Number.isNaN(value)) return '--';
  if (def.labels) return def.labels[value] ?? String(value);
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (!def.unit) return text;
  return /^[°%]/.test(def.unit) ? `${text}${def.unit}` : `${text} ${def.unit}`; // °F·%는 붙이고 CFM은 띄운다
}

/**
 * 포인트 저장소. AHU 하나가 하나씩 가진다(AHU마다 값이 따로 움직이므로).
 * 반환:
 *  - names(): 포인트 이름 목록
 *  - definition(name): POINT_DEFS의 항목
 *  - get(name): { name, value, status }
 *  - set(name, value, status?): 값이나 상태가 바뀐 경우에만 구독자에게 알린다
 *  - subscribe(name, fn): fn({ name, value, status, prev })를 변경 때마다 호출. 해제 함수를 돌려준다
 *  - subscribeAll(fn): 모든 포인트의 변경을 받는다. 해제 함수를 돌려준다
 * 없는 포인트 이름은 오타를 조용히 넘기지 않도록 예외를 던진다.
 */
export function createPointStore(defs = POINT_DEFS) {
  const entries = new Map(defs.map((def) => [def.name, { def, value: def.value, status: POINT_STATUS.OK }]));
  const listeners = new Map(defs.map((def) => [def.name, new Set()]));
  const allListeners = new Set();

  function entryOf(name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`알 수 없는 포인트: ${name}`);
    return entry;
  }

  function subscribeTo(set, fn) {
    set.add(fn);
    return () => set.delete(fn);
  }

  return {
    names: () => [...entries.keys()],
    definition: (name) => entryOf(name).def,

    get(name) {
      const { value, status } = entryOf(name);
      return { name, value, status };
    },

    set(name, value, status) {
      const entry = entryOf(name);
      const nextStatus = status ?? entry.status;
      if (Object.is(entry.value, value) && entry.status === nextStatus) return;
      const prev = entry.value;
      entry.value = value;
      entry.status = nextStatus;
      const change = { name, value, status: nextStatus, prev };
      for (const fn of listeners.get(name)) fn(change);
      for (const fn of allListeners) fn(change);
    },

    subscribe(name, fn) {
      entryOf(name);
      return subscribeTo(listeners.get(name), fn);
    },

    subscribeAll(fn) {
      return subscribeTo(allListeners, fn);
    },
  };
}
