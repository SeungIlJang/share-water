import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomWater, loadCustomWater, saveCustomWater, CUSTOM_WATER_KEY } from '../src/utils/customWater.js';

const point = { title: ' 새 음수대 ', latitude: 37.5, longitude: 127.1, detailLocation: ' 정문 옆 ' };
test('직접 등록한 음수대는 기기에 저장되고 다시 불러올 수 있다', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const item = createCustomWater(point);
  assert.equal(item.title, '새 음수대');
  assert.equal(item.detailLocation, '정문 옆');
  assert.match(item.id, /^custom-/);
  saveCustomWater([item], storage);
  assert.deepEqual(loadCustomWater(storage), [item]);
  saveCustomWater([], storage);
  assert.deepEqual(loadCustomWater(storage), []);
});

test('빈 이름과 범위를 벗어난 좌표는 등록하지 않는다', () => {
  for (const input of [{ title: '' }, { latitude: 91 }, { longitude: NaN }, { title: 'a'.repeat(81) }]) {
    assert.throws(() => createCustomWater({ ...point, ...input }));
  }
});

test('손상된 저장 데이터는 앱 시작을 막지 않고 저장 실패는 사용자에게 알린다', () => {
  assert.deepEqual(loadCustomWater({ getItem: () => '{broken' }), []);
  assert.deepEqual(loadCustomWater({ getItem: () => JSON.stringify([null, { id: 'custom-1', custom: true, title: 'bad', latitude: 500, longitude: 0 }]) }), []);
  assert.throws(() => saveCustomWater([], { setItem() { throw new Error('quota'); } }), /저장하지 못했습니다/);
  assert.equal(CUSTOM_WATER_KEY, 'share-water:custom-water:v1');
});
