import { loadCustomWater } from '@/utils/customWater.js';

const BASE = import.meta.env.VITE_COMMUNITY_API_URL || 'https://share-water-community-api.season-masil.workers.dev';
const OWNER_KEY = 'share-water:community-owner:v1';
const CACHE_KEY = 'share-water:community-cache:v1';

const ownerToken = (create = false) => {
  let token = localStorage.getItem(OWNER_KEY);
  if (!/^[a-f0-9]{64}$/.test(token || '') && create) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(OWNER_KEY, token);
  }
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
};

async function request(path, { method = 'GET', body } = {}) {
  let token;
  try { token = ownerToken(method !== 'GET'); }
  catch { throw new Error('기기 저장 공간을 사용할 수 없습니다. 앱 설정을 확인해 주세요.'); }
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new Error('공유 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '공유 요청을 처리하지 못했습니다.');
  return result;
}

export const loadCommunityCache = () => loadCustomWater({
  getItem: () => localStorage.getItem(CACHE_KEY),
});

export function saveCommunityCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch { /* 서버 데이터는 유지됨 */ }
}

export async function fetchCommunityWater() {
  const items = [];
  let cursor = '';
  do {
    const result = await request(`/water${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    items.push(...result.items);
    if (result.cursor === cursor) throw new Error('공유 목록을 다시 불러와 주세요.');
    cursor = result.cursor;
  } while (cursor);
  saveCommunityCache(items);
  return items;
}

export const publishCommunityWater = async (item) => (await request('/water', { method: 'POST', body: {
  id: item.id, title: item.title, detailLocation: item.detailLocation,
  latitude: item.latitude, longitude: item.longitude,
} })).item;

export const deleteCommunityWater = (id) => request(`/water/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function mergeWaterLocations(official, shared, local) {
  const community = new Map(shared.map((item) => [item.id, item]));
  for (const item of local) if (!community.has(item.id)) community.set(item.id, item);
  return [...official, ...community.values()];
}
