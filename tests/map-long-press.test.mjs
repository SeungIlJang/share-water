import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { installMapLongPress } from '../src/utils/mapLongPress.js';

function fixture() {
  const element = new EventTarget();
  element.closest = () => null;
  element.getBoundingClientRect = () => ({ left: 10, top: 20 });
  const points = [];
  const cleanup = installMapLongPress(element, (point) => points.push(point), { delay: 15 });
  const send = (name, props = {}) => {
    const event = Object.assign(new Event(name), { isPrimary: true, button: 0, pointerId: 1, clientX: 50, clientY: 70, ...props });
    element.dispatchEvent(event);
  };
  return { element, points, cleanup, send };
}

test('길게 누른 정확한 지도 내부 좌표를 한 번만 전달한다', async () => {
  const f = fixture();
  f.send('pointerdown');
  await wait(35);
  assert.deepEqual(f.points, [{ x: 40, y: 50 }]);
  f.send('pointerup');
  f.cleanup();
});

test('짧은 탭·지도 드래그·취소·멀티터치·마커는 추가를 시작하지 않는다', async () => {
  for (const mode of ['tap', 'drag', 'cancel', 'multi', 'marker', 'unmount']) {
    const f = fixture();
    if (mode === 'marker') f.element.closest = () => ({});
    f.send('pointerdown');
    if (mode === 'tap') f.send('pointerup');
    if (mode === 'drag') f.send('pointermove', { clientX: 80 });
    if (mode === 'cancel') f.send('pointercancel');
    if (mode === 'multi') f.send('pointerdown', { isPrimary: false, pointerId: 2 });
    if (mode === 'unmount') f.cleanup();
    await wait(35);
    assert.equal(f.points.length, 0, mode);
    f.cleanup();
  }
});
