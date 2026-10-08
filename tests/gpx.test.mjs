import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGpx, createGpxFilename } from '../src/utils/gpx.js';

test('경로 좌표와 음수대 경유지를 GPX 1.1로 만든다', () => {
  const gpx = buildGpx({
    name: '한강 & 음수대',
    coordinates: [
      { latitude: 37.5, longitude: 127 },
      { latitude: 37.51, longitude: 127.01 },
    ],
    waypoints: [{ title: '첫 <음수대>', latitude: 37.51, longitude: 127.01 }],
  });
  assert.match(gpx, /<gpx version="1.1"/);
  assert.match(gpx, /한강 &amp; 음수대/);
  assert.match(gpx, /첫 &lt;음수대&gt;/);
  assert.equal((gpx.match(/<trkpt/g) || []).length, 2);
});

test('GPX 파일명은 영문과 날짜로 생성한다', () => {
  assert.equal(
    createGpxFilename(new Date(2026, 9, 8, 17, 40)),
    'share-water-course-202610081740.gpx',
  );
});
