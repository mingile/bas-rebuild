import { ALARM_STATUS } from '../dataSource.js';
import { el } from './dom.js';

const COLUMNS = ['발생 시각', '설비', '내용', '상태', '확인'];

/** 알람의 표시용 상태. Normal / Alarm (Unacked) / Alarm (Acked) */
function statusOf(alarm) {
  if (alarm.status !== ALARM_STATUS.ALARM) return { key: 'normal', label: 'Normal' };
  return alarm.acked ? { key: 'acked', label: 'Alarm (Acked)' } : { key: 'unacked', label: 'Alarm (Unacked)' };
}

/**
 * 알람 콘솔(모달). open(alarms)을 부를 때마다 받은 목록으로 다시 그린다(열려 있으면 갱신).
 * onAcknowledge(alarmId): Ack 버튼을 눌렀을 때 부른다. 확인 처리와 목록 갱신(open 재호출)은 호출하는 쪽이 한다.
 * 반환: { element, open(alarms) }
 */
export function createAlarmConsole({ building, onAcknowledge }) {
  const subtitle = el('p', { className: 'alarm-console__sub' });
  const body = el('div', { className: 'alarm-console__body' });

  const closeButton = el('button', {
    className: 'alarm-console__close',
    type: 'button',
    textContent: '×',
    attrs: { 'aria-label': '알람 콘솔 닫기' },
  });

  const dialog = el(
    'dialog',
    { className: 'alarm-console', attrs: { 'aria-labelledby': 'alarm-console-title' } },
    el(
      'header',
      { className: 'alarm-console__head' },
      el('div', {}, el('h2', { id: 'alarm-console-title', textContent: '알람 콘솔' }), subtitle),
      closeButton,
    ),
    body,
  );

  closeButton.addEventListener('click', () => dialog.close());
  // 백드롭을 누르면 dialog 자신이 클릭 대상이 된다(내용 영역은 padding 없이 자식이 채운다)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  function ackButton(alarm) {
    const button = el('button', {
      className: 'alarm-console__ack',
      type: 'button',
      textContent: 'Ack',
      attrs: { 'aria-label': `${alarm.equipment} ${alarm.message} 알람 확인(Ack)` },
    });
    button.addEventListener('click', async () => {
      button.disabled = true; // 처리 중 중복 클릭 방지
      try {
        await onAcknowledge(alarm.id);
      } catch (err) {
        console.error(err);
        button.disabled = false;
      }
    });
    return button;
  }

  function row(alarm) {
    const status = statusOf(alarm);
    return el(
      'tr',
      { className: `is-${status.key}` },
      el('td', { className: 'alarm-console__time', textContent: alarm.time }),
      el('td', { textContent: alarm.equipment }),
      el('td', { textContent: alarm.message }),
      el('td', {}, el('span', { className: `chip chip--${status.key}`, textContent: status.label })),
      el('td', {}, status.key === 'unacked' ? ackButton(alarm) : ''),
    );
  }

  function table(alarms) {
    return el(
      'table',
      { className: 'alarm-console__table' },
      el('thead', {}, el('tr', {}, ...COLUMNS.map((name) => el('th', { scope: 'col', textContent: name })))),
      el('tbody', {}, ...alarms.map(row)),
    );
  }

  return {
    element: dialog,

    open(alarms) {
      const active = alarms.filter((a) => a.status === ALARM_STATUS.ALARM);
      const unacked = active.filter((a) => !a.acked).length;
      subtitle.textContent = `${building.textContent} · 발생 ${active.length}건 (미확인 ${unacked}건) / 전체 ${alarms.length}건`;

      const scrollTop = body.scrollTop;
      const hadFocusInBody = body.contains(document.activeElement);
      body.replaceChildren(
        alarms.length > 0 ? table(alarms) : el('p', { className: 'alarm-console__empty', textContent: '알람 이력이 없습니다.' }),
      );
      body.scrollTop = scrollTop;

      if (!dialog.open) dialog.showModal();
      // 누른 Ack 버튼이 사라지므로, 키보드 포커스를 남은 Ack 버튼(없으면 닫기 버튼)으로 옮긴다
      else if (hadFocusInBody) (body.querySelector('.alarm-console__ack') ?? closeButton).focus();
    },
  };
}
