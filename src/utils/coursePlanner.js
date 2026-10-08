import { getDistanceKm } from './distance.js';

const validCoordinate = ({ latitude, longitude } = {}) => (
  Number.isFinite(latitude) && Number.isFinite(longitude)
);

const distanceBetween = (a, b) => getDistanceKm(
  a.latitude,
  a.longitude,
  b.latitude,
  b.longitude,
);

export const loopDistanceKm = (origin, locations) => {
  if (!validCoordinate(origin) || !locations.length) return 0;
  const points = [origin, ...locations, origin];
  return points.slice(1).reduce(
    (total, point, index) => total + distanceBetween(points[index], point),
    0,
  );
};

export const shortlistCourseCandidates = (
  locations,
  origin,
  targetDistanceKm,
  limit = 16,
) => {
  const maxRadiusKm = Math.max(1, targetDistanceKm * 0.48);
  return locations
    .filter((location) => validCoordinate(location) && !location.approximate)
    .map((location) => ({
      ...location,
      courseDistanceKm: distanceBetween(origin, location),
    }))
    .filter(({ courseDistanceKm }) => courseDistanceKm >= 0.05 && courseDistanceKm <= maxRadiusKm)
    .sort((a, b) => a.courseDistanceKm - b.courseDistanceKm)
    .slice(0, limit);
};

const bestInsertion = (origin, selected, candidate) => {
  const cycle = [origin, ...selected, origin];
  let best = { index: 0, increaseKm: Infinity };
  for (let index = 0; index < cycle.length - 1; index += 1) {
    const increaseKm = distanceBetween(cycle[index], candidate)
      + distanceBetween(candidate, cycle[index + 1])
      - distanceBetween(cycle[index], cycle[index + 1]);
    if (increaseKm < best.increaseKm) best = { index, increaseKm };
  }
  return best;
};

const twoOpt = (origin, locations) => {
  let route = [...locations];
  let improved = true;
  while (improved) {
    improved = false;
    for (let start = 0; start < route.length - 1; start += 1) {
      for (let end = start + 1; end < route.length; end += 1) {
        const candidate = [
          ...route.slice(0, start),
          ...route.slice(start, end + 1).reverse(),
          ...route.slice(end + 1),
        ];
        if (loopDistanceKm(origin, candidate) + 0.001 < loopDistanceKm(origin, route)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
};

export const buildCourseDraft = (origin, candidates, targetDistanceKm, maxStops = 5) => {
  const desiredStraightDistance = targetDistanceKm * 0.72;
  const selected = [];
  const remaining = [...candidates];

  while (remaining.length && selected.length < maxStops) {
    const currentDistance = loopDistanceKm(origin, selected);
    const choices = remaining.map((candidate) => {
      const insertion = bestInsertion(origin, selected, candidate);
      return {
        candidate,
        ...insertion,
        nextDistance: currentDistance + insertion.increaseKm,
      };
    });
    const underTarget = choices
      .filter(({ nextDistance }) => nextDistance <= desiredStraightDistance)
      .sort((a, b) => b.nextDistance - a.nextDistance)[0];
    const choice = underTarget || (selected.length < Math.min(2, candidates.length)
      ? choices.sort((a, b) => a.increaseKm - b.increaseKm)[0]
      : null);
    if (!choice) break;

    selected.splice(choice.index, 0, choice.candidate);
    remaining.splice(remaining.indexOf(choice.candidate), 1);
  }

  return twoOpt(origin, selected);
};

const routePoints = (origin, selected) => [
  { ...origin, id: 'course-origin', title: origin.title || '출발점' },
  ...selected,
  { ...origin, id: 'course-return', title: origin.title || '출발점' },
];

export const createAutomaticCourse = async ({
  origin,
  locations,
  targetDistanceKm,
  fetchRoute,
  fetchDistances,
  signal,
}) => {
  let candidates = shortlistCourseCandidates(locations, origin, targetDistanceKm);
  if (!candidates.length) throw new Error('주변에 코스에 포함할 음수대가 없습니다.');

  if (fetchDistances) {
    const measured = await fetchDistances(origin, candidates, { signal });
    const reachable = measured
      .filter(({ walkingDistanceKm }) => Number.isFinite(walkingDistanceKm))
      .sort((a, b) => a.walkingDistanceKm - b.walkingDistanceKm);
    const withinTarget = reachable.filter(
      ({ walkingDistanceKm }) => walkingDistanceKm * 2 <= targetDistanceKm * 1.25,
    );
    candidates = (withinTarget.length ? withinTarget : reachable.slice(0, 3)).slice(0, 12);
    if (!candidates.length) throw new Error('주변 음수대까지의 보행 경로를 찾지 못했습니다.');
  }

  let selected = buildCourseDraft(origin, candidates, targetDistanceKm);
  if (!selected.length) selected = [candidates[0]];
  let result = await fetchRoute(routePoints(origin, selected), { signal });

  for (let adjustment = 0; adjustment < 2; adjustment += 1) {
    const remaining = candidates.filter((candidate) => !selected.includes(candidate));
    const currentStraight = loopDistanceKm(origin, selected);
    const scale = result.distanceKm / Math.max(currentStraight, 0.1);
    if (result.distanceKm < targetDistanceKm * 0.78 && remaining.length && selected.length < 5) {
      const choice = remaining.map((candidate) => {
        const insertion = bestInsertion(origin, selected, candidate);
        return {
          candidate,
          ...insertion,
          projectedKm: result.distanceKm + insertion.increaseKm * scale,
        };
      }).sort((a, b) => (
        Math.abs(a.projectedKm - targetDistanceKm) - Math.abs(b.projectedKm - targetDistanceKm)
      ))[0];
      selected.splice(choice.index, 0, choice.candidate);
      selected = twoOpt(origin, selected);
    } else if (result.distanceKm > targetDistanceKm * 1.25 && selected.length > 1) {
      const alternatives = [];
      for (let mask = 1; mask < (1 << selected.length); mask += 1) {
        const subset = selected.filter((_, index) => mask & (1 << index));
        if (subset.length < selected.length) alternatives.push(twoOpt(origin, subset));
      }
      selected = alternatives.sort((a, b) => (
        Math.abs(loopDistanceKm(origin, a) * scale - targetDistanceKm)
        - Math.abs(loopDistanceKm(origin, b) * scale - targetDistanceKm)
      ))[0];
    } else {
      break;
    }
    result = await fetchRoute(routePoints(origin, selected), { signal });
  }

  return {
    ...result,
    origin,
    stops: selected,
    targetDistanceKm,
  };
};
