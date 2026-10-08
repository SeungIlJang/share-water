import assert from 'node:assert/strict';
import test from 'node:test';
import {
  angleBetweenTouches,
  mapPanOffsetForScreenDrag,
  normalizeBearing,
  normalizeRotationDelta,
  rotateScreenDelta,
} from '../src/utils/mapRotation.js';

test('두 손가락 위치의 각도를 계산한다', () => {
  assert.equal(angleBetweenTouches([
    { clientX: 0, clientY: 0 },
    { clientX: 10, clientY: 0 },
  ]), 0);
  assert.equal(angleBetweenTouches([
    { clientX: 0, clientY: 0 },
    { clientX: 0, clientY: 10 },
  ]), 90);
  assert.equal(angleBetweenTouches([{ clientX: 0, clientY: 0 }]), null);
});

test('각도 경계를 넘는 회전 변화량을 가장 짧은 방향으로 정규화한다', () => {
  assert.equal(normalizeRotationDelta(358), -2);
  assert.equal(normalizeRotationDelta(-358), 2);
  assert.equal(normalizeRotationDelta(90), 90);
});

test('지도 방위각을 0도 이상 360도 미만으로 유지한다', () => {
  assert.equal(normalizeBearing(370), 10);
  assert.equal(normalizeBearing(-10), 350);
  assert.equal(normalizeBearing(180), 180);
});

test('회전된 지도에서 손가락 이동 방향을 지도 좌표축으로 역변환한다', () => {
  const at90 = rotateScreenDelta(10, 0, 90);
  assert.ok(Math.abs(at90.x) < 1e-10);
  assert.ok(Math.abs(at90.y + 10) < 1e-10);

  const at180 = rotateScreenDelta(10, 5, 180);
  assert.ok(Math.abs(at180.x + 10) < 1e-10);
  assert.ok(Math.abs(at180.y + 5) < 1e-10);

  assert.deepEqual(rotateScreenDelta(10, 5, 0), { x: 10, y: 5 });
});

test('네이버 지도 이동 오프셋은 손가락 방향과 회전각을 함께 보정한다', () => {
  assert.deepEqual(mapPanOffsetForScreenDrag(10, 5, 0), { x: -10, y: -5 });

  const at90 = mapPanOffsetForScreenDrag(10, 0, 90);
  assert.ok(Math.abs(at90.x) < 1e-10);
  assert.ok(Math.abs(at90.y - 10) < 1e-10);
});
