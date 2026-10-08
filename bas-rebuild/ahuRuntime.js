// 플랫폼이 주기적으로 로직을 실행하는 방식을 흉내 낸다. 한 주기마다 시뮬레이터 → 제어 로직 순서로 돈다.
// 화면 갱신은 포인트 구독이 맡으므로 여기서 따로 부르지 않는다.

import { stepSimulator } from './simulator.js';
import { runAhuControl } from './logic/ahuControl.js';

const SCAN_INTERVAL_MS = 1000;

/** 포인트 저장소 하나에 대해 주기 실행을 시작한다. 시작할 때 한 번 돌고, 반환된 함수를 부르면 멈춘다. */
export function startAhuRuntime(points, intervalMs = SCAN_INTERVAL_MS) {
  const scan = () => {
    stepSimulator(points);
    runAhuControl(points);
  };
  scan();
  const timer = setInterval(scan, intervalMs);
  return () => clearInterval(timer);
}
