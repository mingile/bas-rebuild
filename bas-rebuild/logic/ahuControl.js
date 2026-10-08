// 공조기 제어 로직. 한 주기마다 runAhuControl(points)를 부르면 입력 포인트를 읽어 출력 포인트에 쓴다.
// 지금은 급기팬이 돌면 외기 댐퍼를 여는 규칙 하나뿐인 임시 로직이다.
// 스케줄 운전, 팬 상태를 확인한 뒤 밸브가 동작하는 인터록, 급기온도 비례 제어는 이 모듈에 직접 구현한다.

export function runAhuControl(points) {
  // 급기팬 상태(SF-S)를 따라간다: 운전(1)이면 열림(1), 정지(0)이면 닫힘(0)
  points.set('OA-D', points.get('SF-S').value);
}
