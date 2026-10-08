// 설비 쪽 시뮬레이터. 한 주기마다 stepSimulator(points)를 부르면 설비의 반응을 포인트에 쓴다.
// 지금은 명령 → 상태 피드백만 있다. 외기온도 변화, 밸브 개도에 따른 급기온도 반응 등 물리 근사는 여기에 더한다.

// [명령 포인트, 상태 포인트]: 명령이 바뀌면 설비가 따라 움직여 상태가 같아진다.
const FEEDBACK = [
  ['SF-C', 'SF-S'],
  ['RF-C', 'RF-S'],
];

export function stepSimulator(points) {
  for (const [command, status] of FEEDBACK) {
    points.set(status, points.get(command).value);
  }
}
