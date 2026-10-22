export const CUSTOM_WATER_KEY = 'share-water:custom-water:v1';

const validCoordinates = (latitude, longitude) => Number.isFinite(latitude)
  && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

export function createCustomWater({ title, detailLocation = '', latitude, longitude }) {
  const name = String(title || '').trim();
  const detail = String(detailLocation).trim();
  if (!name || name.length > 80) throw new Error('음수대 이름을 1~80자로 입력해 주세요.');
  if (detail.length > 200) throw new Error('위치 메모는 200자 이내로 입력해 주세요.');
  if (!validCoordinates(latitude, longitude)) throw new Error('지도 위치를 다시 선택해 주세요.');
  return {
    id: `custom-${crypto.randomUUID()}`, title: name, detailLocation: detail,
    latitude, longitude, address: `위도 ${latitude.toFixed(6)} · 경도 ${longitude.toFixed(6)}`,
    source: '직접 추가 · 내 기기 저장', custom: true,
  };
}

export function loadCustomWater(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(CUSTOM_WATER_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && item.custom === true
      && typeof item.id === 'string' && item.id.startsWith('custom-')
      && typeof item.title === 'string' && item.title.trim() && item.title.length <= 80
      && validCoordinates(item.latitude, item.longitude));
  } catch { return []; }
}

export function saveCustomWater(items, storage = localStorage) {
  try { storage.setItem(CUSTOM_WATER_KEY, JSON.stringify(items)); }
  catch { throw new Error('기기에 저장하지 못했습니다. 저장 공간과 앱 설정을 확인해 주세요.'); }
}
