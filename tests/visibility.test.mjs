import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleAreaRatio } from '../src/utils/visibility.js';

const viewport = { left: 0, top: 0, right: 100, bottom: 100 };

test('정보창 전체가 지도 안에 있으면 가시 비율은 100%다', () => {
  assert.equal(visibleAreaRatio({ left: 20, top: 20, right: 80, bottom: 80 }, viewport), 1);
});

test('정보창이 화면에 10%만 남으면 가시 비율은 10%다', () => {
  assert.equal(visibleAreaRatio({ left: 90, top: 0, right: 190, bottom: 100 }, viewport), 0.1);
});

test('정보창이 지도 밖으로 완전히 나가면 가시 비율은 0%다', () => {
  assert.equal(visibleAreaRatio({ left: 110, top: 0, right: 210, bottom: 100 }, viewport), 0);
});
