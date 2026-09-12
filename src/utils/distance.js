const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => degrees * (Math.PI / 180);

/** 두 WGS84 좌표 사이의 대권거리(km)를 Haversine 공식으로 계산합니다. */
export const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const locationsWithinRadius = (locations, origin, radiusMeters) => {
  if (!origin) return [];
  const limitKm = radiusMeters / 1000;
  return locations
    .map((location) => ({
      ...location,
      distance: getDistanceKm(
        origin.latitude,
        origin.longitude,
        location.latitude,
        location.longitude,
      ),
    }))
    .filter((location) => location.distance <= limitKm)
    .sort((a, b) => a.distance - b.distance);
};
