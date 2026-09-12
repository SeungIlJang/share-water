import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_SEARCH_RADIUS_METERS, SEARCH_RADIUS_OPTIONS } from '../src/config.js';
import { getDistanceKm, locationsWithinRadius } from '../src/utils/distance.js';

test('첫 진입 기본 반경은 1km이고 선택 목록에도 포함된다', () => {
  assert.equal(DEFAULT_SEARCH_RADIUS_METERS, 1000);
  assert.ok(SEARCH_RADIUS_OPTIONS.includes(DEFAULT_SEARCH_RADIUS_METERS));
});

test('Haversine 거리는 알려진 지구 대권거리와 일치한다', () => {
  assert.equal(getDistanceKm(37.5, 127, 37.5, 127), 0);
  assert.ok(Math.abs(getDistanceKm(0, 0, 0, 1) - 111.195) < 0.01);
  assert.ok(Math.abs(
    getDistanceKm(37.5666805, 126.9784147, 37.5511694, 126.9882266) - 1.928,
  ) < 0.01);
});

test('선택 반경을 바꾸면 해당 거리 안의 장소만 즉시 다시 계산된다', () => {
  const origin = { latitude: 37.5, longitude: 127 };
  const locations = [
    { id: 'same', latitude: 37.5, longitude: 127 },
    { id: 'near', latitude: 37.505, longitude: 127 },
    { id: 'middle', latitude: 37.51, longitude: 127 },
    { id: 'far', latitude: 37.53, longitude: 127 },
  ];
  assert.deepEqual(locationsWithinRadius(locations, origin, 1000).map(({ id }) => id), ['same', 'near']);
  assert.deepEqual(locationsWithinRadius(locations, origin, 2000).map(({ id }) => id), ['same', 'near', 'middle']);
  assert.deepEqual(locationsWithinRadius(locations, origin, 5000).map(({ id }) => id), ['same', 'near', 'middle', 'far']);
});

test('실제 음수대 데이터에서도 반경이 커질수록 결과가 줄지 않는다', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
  const origin = { latitude: 37.5297, longitude: 126.9647 };
  const counts = SEARCH_RADIUS_OPTIONS.map((radius) => locationsWithinRadius(data, origin, radius).length);
  assert.ok(counts[1] >= counts[0]);
  assert.ok(counts.every((count, index) => index === 0 || count >= counts[index - 1]));
  assert.ok(counts.at(-1) > counts[0]);
});
