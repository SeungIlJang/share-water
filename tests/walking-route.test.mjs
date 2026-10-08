import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWalkingRoutePayload,
  decodePolyline6,
  fetchWalkingRoute,
} from '../src/utils/walkingRoute.js';

test('Valhalla polyline6 경로를 위도·경도로 복원한다', () => {
  assert.deepEqual(decodePolyline6('_gjaR_ouce@?gE'), [
    { latitude: 10, longitude: 20 },
    { latitude: 10, longitude: 20.0001 },
  ]);
});

test('두 곳 미만은 보행 경로를 요청하지 않는다', async () => {
  await assert.rejects(
    fetchWalkingRoute([{ latitude: 37.5, longitude: 127 }]),
    /두 곳 이상의 위치/,
  );
});

test('선택한 모든 음수대를 추가한 순서대로 경유지에 포함한다', () => {
  const payload = buildWalkingRoutePayload([
    { id: 'first', latitude: 37.51, longitude: 126.91 },
    { id: 'second', latitude: 37.52, longitude: 126.92 },
    { id: 'third', latitude: 37.53, longitude: 126.93 },
  ]);

  assert.deepEqual(payload.locations, [
    { lat: 37.51, lon: 126.91, type: 'break' },
    { lat: 37.52, lon: 126.92, type: 'break' },
    { lat: 37.53, lon: 126.93, type: 'break' },
  ]);
});
