import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCourseDraft,
  createAutomaticCourse,
  loopDistanceKm,
  shortlistCourseCandidates,
} from '../src/utils/coursePlanner.js';

const origin = { latitude: 37.5, longitude: 127 };
const locations = [
  { id: 'a', latitude: 37.501, longitude: 127.001 },
  { id: 'b', latitude: 37.504, longitude: 127.002 },
  { id: 'c', latitude: 37.507, longitude: 127.004 },
  { id: 'approx', latitude: 37.502, longitude: 127.002, approximate: true },
];

test('자동 코스 후보에서 대표 좌표와 먼 지점을 제외한다', () => {
  const candidates = shortlistCourseCandidates([
    ...locations,
    { id: 'far', latitude: 37.7, longitude: 127.2 },
  ], origin, 3);
  assert.deepEqual(candidates.map(({ id }) => id), ['a', 'b', 'c']);
});

test('코스 초안은 출발점으로 돌아오는 순환 거리로 계산한다', () => {
  const candidates = shortlistCourseCandidates(locations, origin, 3);
  const draft = buildCourseDraft(origin, candidates, 3);
  assert.ok(draft.length >= 2);
  assert.ok(loopDistanceKm(origin, draft) > 0);
  assert.ok(draft.length <= 5);
});

test('자동 코스 요청은 출발점과 도착점을 동일하게 구성한다', async () => {
  let requested;
  const course = await createAutomaticCourse({
    origin,
    locations,
    targetDistanceKm: 3,
    fetchRoute: async (points) => {
      requested = points;
      return { coordinates: points, distanceKm: 3, durationMinutes: 40 };
    },
  });
  assert.deepEqual(
    { latitude: requested[0].latitude, longitude: requested[0].longitude },
    { latitude: requested.at(-1).latitude, longitude: requested.at(-1).longitude },
  );
  assert.equal(course.targetDistanceKm, 3);
  assert.ok(course.stops.length >= 1);
});
