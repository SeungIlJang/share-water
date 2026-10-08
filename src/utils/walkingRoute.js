const DEFAULT_ROUTING_API_URL = 'https://valhalla1.openstreetmap.de/route';

const matrixApiUrl = (apiUrl) => (
  apiUrl.replace(/\/route\/?(?:\?.*)?$/, '/sources_to_targets')
);

export const decodePolyline6 = (encoded) => {
  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      latitude: latitude / 1e6,
      longitude: longitude / 1e6,
    });
  }

  return coordinates;
};

export const buildWalkingRoutePayload = (locations) => ({
  locations: locations.map(({ latitude, longitude }) => ({
    lat: latitude,
    lon: longitude,
    type: 'break',
  })),
  costing: 'pedestrian',
  shape_format: 'polyline6',
  units: 'kilometers',
  directions_options: { units: 'kilometers' },
});

export const fetchWalkingRoute = async (locations, options = {}) => {
  if (!Array.isArray(locations) || locations.length < 2) {
    throw new Error('보행 경로에는 두 곳 이상의 위치가 필요합니다.');
  }

  const payload = buildWalkingRoutePayload(locations);
  const apiUrl = options.apiUrl || DEFAULT_ROUTING_API_URL;
  const url = `${apiUrl}?json=${encodeURIComponent(JSON.stringify(payload))}`;
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`보행 경로 서버 오류 (${response.status})`);

  const result = await response.json();
  const legs = result.trip?.legs;
  if (!Array.isArray(legs) || !legs.length) throw new Error('보행 경로를 찾지 못했습니다.');

  const coordinates = legs.flatMap((leg, legIndex) => {
    const decoded = decodePolyline6(leg.shape || '');
    return legIndex ? decoded.slice(1) : decoded;
  });
  if (coordinates.length < 2) throw new Error('보행 경로 좌표가 올바르지 않습니다.');

  return {
    coordinates,
    distanceKm: Number(result.trip.summary?.length) || 0,
    durationMinutes: Math.max(1, Math.round((Number(result.trip.summary?.time) || 0) / 60)),
  };
};

export const fetchWalkingDistances = async (origin, targets, options = {}) => {
  if (!targets.length) return [];
  const payload = {
    sources: [{ lat: origin.latitude, lon: origin.longitude }],
    targets: targets.map(({ latitude, longitude }) => ({ lat: latitude, lon: longitude })),
    costing: 'pedestrian',
    units: 'kilometers',
  };
  const apiUrl = matrixApiUrl(options.apiUrl || DEFAULT_ROUTING_API_URL);
  const url = `${apiUrl}?json=${encodeURIComponent(JSON.stringify(payload))}`;
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`보행 거리 서버 오류 (${response.status})`);
  const result = await response.json();
  const row = result.sources_to_targets?.[0];
  if (!Array.isArray(row)) throw new Error('보행 거리 결과가 올바르지 않습니다.');
  return targets.map((target, index) => ({
    ...target,
    walkingDistanceKm: Number(row[index]?.distance),
    walkingDurationMinutes: Math.max(1, Math.round((Number(row[index]?.time) || 0) / 60)),
  }));
};
