import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const dataPath = resolve(root, 'public/data.json');
const versionPath = resolve(root, 'public/data-version.json');
const supplementalPath = resolve(root, 'public/supplemental-data.json');
const OVERPASS_URLS = [
  process.env.OVERPASS_URL,
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
].filter(Boolean);
const OSM_CACHE_DIR = process.env.OSM_CACHE_DIR || '';
const USER_AGENT = 'share-water-app/1.1 (public drinking-water dataset builder)';
const regions = [
  { key: 'seoul', code: 'KR-11', name: '서울특별시' },
  { key: 'gyeonggi', code: 'KR-41', name: '경기도' },
  { key: 'incheon', code: 'KR-28', name: '인천광역시' },
];

const overpass = async (query) => {
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      console.warn(`[data] Overpass 재시도: ${error.message}`);
    }
  }
  throw lastError;
};

const loadOrFetch = async (cacheName, query) => {
  if (OSM_CACHE_DIR) {
    try {
      return JSON.parse(await readFile(resolve(OSM_CACHE_DIR, cacheName), 'utf8'));
    } catch {
      // 캐시가 없거나 손상된 경우 공개 서버에서 다시 받는다.
    }
  }
  return overpass(query);
};

const coordinateOf = (element) => ({
  latitude: Number(element.lat ?? element.center?.lat),
  longitude: Number(element.lon ?? element.center?.lon),
});

const keyOf = (point) => `${point.lat.toFixed(7)},${point.lon.toFixed(7)}`;

const stitchRings = (members) => {
  const remaining = members
    .filter((member) => member.role === 'outer' && member.geometry?.length >= 2)
    .map((member) => member.geometry.map(({ lat, lon }) => ({ lat, lon })));
  const rings = [];

  while (remaining.length) {
    const ring = remaining.shift();
    let connected = true;
    while (connected && keyOf(ring[0]) !== keyOf(ring.at(-1))) {
      connected = false;
      const first = keyOf(ring[0]);
      const last = keyOf(ring.at(-1));
      const index = remaining.findIndex((segment) => {
        const start = keyOf(segment[0]);
        const end = keyOf(segment.at(-1));
        return start === last || end === last || end === first || start === first;
      });
      if (index < 0) continue;
      const segment = remaining.splice(index, 1)[0];
      const start = keyOf(segment[0]);
      const end = keyOf(segment.at(-1));
      if (start === last) ring.push(...segment.slice(1));
      else if (end === last) ring.push(...segment.reverse().slice(1));
      else if (end === first) ring.unshift(...segment.slice(0, -1));
      else if (start === first) ring.unshift(...segment.reverse().slice(0, -1));
      connected = true;
    }
    rings.push(ring);
  }
  return rings;
};

const pointInRing = (latitude, longitude, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i].lat;
    const xi = ring[i].lon;
    const yj = ring[j].lat;
    const xj = ring[j].lon;
    const crosses = ((yi > latitude) !== (yj > latitude))
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
};

const buildDistricts = (elements) => elements.map((element) => {
  const rings = stitchRings(element.members || []);
  const points = rings.flat();
  return {
    name: element.tags?.name,
    rings,
    minLat: Math.min(...points.map(({ lat }) => lat)),
    maxLat: Math.max(...points.map(({ lat }) => lat)),
    minLon: Math.min(...points.map(({ lon }) => lon)),
    maxLon: Math.max(...points.map(({ lon }) => lon)),
  };
}).filter((district) => district.name && district.rings.length);

const districtAt = (districts, latitude, longitude) => districts.find((district) => (
  latitude >= district.minLat && latitude <= district.maxLat
  && longitude >= district.minLon && longitude <= district.maxLon
  && district.rings.some((ring) => pointInRing(latitude, longitude, ring))
))?.name || '';

const distanceKm = (a, b) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const isUnsafe = (tags = {}) => {
  const text = [tags.name, tags.description, tags.note]
    .filter(Boolean).join(' ').toLowerCase();
  return tags.drinking_water === 'no'
    || ['private', 'customers', 'no'].includes(tags.access)
    || tags.disused === 'yes' || tags.abandoned === 'yes' || tags.demolished === 'yes'
    || /음용\s*불가|식수\s*불가|사용\s*불가|관리.{0,5}않|not potable|unsafe|closed/.test(text);
};

const original = JSON.parse(await readFile(dataPath, 'utf8'));
const official = original.filter((item) => item.source !== 'OpenStreetMap contributors');
const districtElements = [];
for (const region of regions) {
  const query = `[out:json][timeout:180];
    area["ISO3166-2"="${region.code}"][boundary=administrative]->.region;
    rel(area.region)["boundary"="administrative"]["admin_level"="6"];
    out geom;`;
  const response = await loadOrFetch(`osm-${region.key}-districts.json`, query);
  districtElements.push(...(response.elements || []));
}
const districts = buildDistricts(districtElements);
const osmCandidates = [];

for (const region of regions) {
  const query = `[out:json][timeout:180];
    area["ISO3166-2"="${region.code}"][boundary=administrative]->.region;
    (nwr["amenity"="drinking_water"](area.region);
     nwr["drinking_water"="yes"](area.region););
    out center tags;`;
  const response = await loadOrFetch(`osm-${region.key}-water.json`, query);
  for (const element of response.elements || []) {
    if (isUnsafe(element.tags)) continue;
    const { latitude, longitude } = coordinateOf(element);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const district = districtAt(districts, latitude, longitude);
    const name = String(element.tags?.name || element.tags?.['name:ko'] || '').trim();
    const placeName = name || `${district || region.name} 음수대`;
    const seasonal = element.tags?.seasonal === 'yes' ? ' (계절 운영 가능)' : '';
    osmCandidates.push({
      id: `osm-${element.type}-${element.id}`,
      title: /음수대|약수|샘터|우물|fountain/i.test(placeName) ? placeName : `${placeName} 음수대`,
      parkName: name || district || region.name,
      latitude,
      longitude,
      address: [region.name, district].filter(Boolean).join(' '),
      newAddress: null,
      detailLocation: `${element.tags?.description || '공개 지도에 등록된 식수 가능 지점'}${seasonal}`,
      office: null,
      source: 'OpenStreetMap contributors',
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    });
  }
}

const osm = [];
for (const candidate of osmCandidates) {
  // 가까운 공식 좌표를 우선하고, OSM 내부의 사실상 동일한 지점도 제거한다.
  if (official.some((item) => distanceKm(item, candidate) <= 0.04)) continue;
  if (osm.some((item) => distanceKm(item, candidate) <= 0.008)) continue;
  osm.push(candidate);
}

const data = [...official, ...osm];
const supplemental = JSON.parse(await readFile(supplementalPath, 'utf8'));
const supplementalLocations = (supplemental.locations || [])
  .filter(({ id }) => !data.some((item) => item.id === id));
const now = new Date();
await writeFile(dataPath, `${JSON.stringify(data)}\n`);
await writeFile(versionPath, `${JSON.stringify({
  v: Number(now.toISOString().slice(0, 10).replaceAll('-', '')),
  updatedAt: now.toISOString(),
  count: data.length + supplementalLocations.length,
  officialCount: official.length + supplementalLocations.length,
  openStreetMapCount: osm.length,
  parkLevelCount: supplementalLocations.filter(({ approximate }) => approximate).length,
  source: '서울시 공원음수대 정보 + 지자체 공식 공원 현황 + OpenStreetMap 수도권 식수 가능 지점',
}, null, 2)}\n`);

console.log(`[data] 공식 좌표 ${official.length.toLocaleString('ko-KR')}건 + 공원 단위 ${supplementalLocations.length.toLocaleString('ko-KR')}건 + OSM 보완 ${osm.length.toLocaleString('ko-KR')}건 = ${(data.length + supplementalLocations.length).toLocaleString('ko-KR')}건 제공`);
