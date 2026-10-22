<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import NaverMapMarker from '@/components/NaverMapMarker.vue';
import { drinkingWaterData } from '@/assets/data.js';
import { searchPlaces } from '@/assets/searchPlaces.js';
import { getCurrentPosition } from '@/utils/geolocation.js';
import { initializeAdMob } from '@/services/adMob.js';
import { DEFAULT_SEARCH_RADIUS_METERS, SEARCH_RADIUS_OPTIONS } from '@/config.js';
import { getDistanceKm, locationsWithinRadius } from '@/utils/distance.js';
import { createCustomWater, loadCustomWater, saveCustomWater } from '@/utils/customWater.js';
import { loadCommunityCache, saveCommunityCache, fetchCommunityWater, publishCommunityWater,
  deleteCommunityWater, mergeWaterLocations } from '@/services/communityWater.js';

const DEFAULT_POSITION = { latitude: 37.5297, longitude: 126.9647 };
const configuredRadius = Number(import.meta.env.VITE_DEFAULT_RADIUS);
const DEFAULT_RADIUS = configuredRadius > 0 ? configuredRadius : DEFAULT_SEARCH_RADIUS_METERS;
const RADIUS_OPTIONS = SEARCH_RADIUS_OPTIONS;

const officialLocations = ref([]);
const sharedLocations = ref(loadCommunityCache());
const customLocations = ref(loadCustomWater());
const locations = computed(() => mergeWaterLocations(officialLocations.value, sharedLocations.value, customLocations.value));
const isSavingWater = ref(false);
const sharedSyncError = ref('');
let sharedRefreshTimer;
let sharedRefreshing = false;
let addWaterDraftId;
const addWaterPosition = ref(null);
const addWaterName = ref('');
const addWaterMemo = ref('');
const addWaterError = ref('');
const deleteWaterId = ref(null);

const openAddWater = (position) => {
  addWaterDraftId = `custom-${crypto.randomUUID()}`;
  addWaterPosition.value = position;
  addWaterName.value = '';
  addWaterMemo.value = '';
  addWaterError.value = '';
};

const refreshSharedWater = async () => {
  if (sharedRefreshing || document.hidden) return;
  sharedRefreshing = true;
  try {
    sharedLocations.value = await fetchCommunityWater();
    sharedSyncError.value = '';
  } catch {
    sharedSyncError.value = '공유 음수대를 불러오지 못해 저장된 정보를 표시합니다.';
  } finally { sharedRefreshing = false; }
};

const addWater = async () => {
  if (isSavingWater.value) return;
  isSavingWater.value = true;
  try {
    const draft = { ...createCustomWater({ ...addWaterPosition.value, title: addWaterName.value, detailLocation: addWaterMemo.value }), id: addWaterDraftId };
    const item = await publishCommunityWater(draft);
    sharedLocations.value = [...sharedLocations.value.filter(({ id }) => id !== item.id), item];
    saveCommunityCache(sharedLocations.value);
    mode.value = 'near';
    searchQuery.value = '';
    searchContextLabel.value = '직접 추가한 위치';
    searchOrigin.value = { latitude: item.latitude, longitude: item.longitude };
    centerLocation.value = { ...searchOrigin.value };
    selectedId.value = item.id;
    addWaterPosition.value = null;
    setSheetCollapsed(false);
  } catch (error) { addWaterError.value = error.message; }
  finally { isSavingWater.value = false; }
};

const shareLocalWater = async (item) => {
  if (isSavingWater.value || !window.confirm('이 음수대의 이름·위치·메모를 모든 사용자에게 공개할까요?')) return;
  isSavingWater.value = true;
  try {
    const saved = await publishCommunityWater(item);
    sharedLocations.value = [...sharedLocations.value.filter(({ id }) => id !== saved.id), saved];
    saveCommunityCache(sharedLocations.value);
    const updated = customLocations.value.filter(({ id }) => id !== saved.id);
    saveCustomWater(updated);
    customLocations.value = updated;
  } catch (error) { window.alert(error.message); }
  finally { isSavingWater.value = false; }
};

const deleteWater = async () => {
  if (isSavingWater.value) return;
  isSavingWater.value = true;
  try {
    const id = deleteWaterId.value;
    const target = locations.value.find((item) => item.id === id);
    if (target?.shared) await deleteCommunityWater(id);
    const updated = customLocations.value.filter((item) => item.id !== id);
    saveCustomWater(updated);
    customLocations.value = updated;
    sharedLocations.value = sharedLocations.value.filter((item) => item.id !== id);
    saveCommunityCache(sharedLocations.value);
    if (selectedId.value === id) selectedId.value = null;
    deleteWaterId.value = null;
    addWaterError.value = '';
  } catch (error) { addWaterError.value = error.message; }
  finally { isSavingWater.value = false; }
};
const selectedId = ref(null);
const searchQuery = ref('');
const isLoading = ref(false);
const isLocating = ref(false);
const centerLocation = ref(null);
const searchOrigin = ref(null);
const searchRadius = ref(DEFAULT_RADIUS);
const mode = ref('near');
const sheetExpanded = ref(false);
const sheetCollapsed = ref(false);
let sheetPointer = null;
let suppressSheetClickUntil = 0;

const setSheetCollapsed = (collapsed) => {
  sheetCollapsed.value = collapsed;
  sheetExpanded.value = false;
};

const startSheetGesture = (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  sheetPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId);
};

const endSheetGesture = (event) => {
  if (!sheetPointer || sheetPointer.id !== event.pointerId) return;
  const dx = event.clientX - sheetPointer.x;
  const dy = event.clientY - sheetPointer.y;
  sheetPointer = null;
  // 드래그 뒤 발생하는 click이 접힘 상태를 다시 바꾸지 않게 한다.
  if (Math.hypot(dx, dy) > 8) suppressSheetClickUntil = Date.now() + 500;
  if (Math.abs(dy) < 32 || Math.abs(dy) < Math.abs(dx) * 1.25) return;
  setSheetCollapsed(dy > 0);
};

const toggleSheet = (event) => {
  if (event.detail !== 0 && Date.now() < suppressSheetClickUntil) return;
  if (sheetCollapsed.value) setSheetCollapsed(false);
  else sheetExpanded.value = !sheetExpanded.value;
};
const searchContextLabel = ref('');
const mapInfoOpen = ref(false);
const updateMessage = ref('');

const handleUpdateStatus = (event) => {
  const { status, message } = event.detail || {};
  updateMessage.value = status === 'ready' ? '' : (message || '업데이트 중...');
};

const formatDistance = (km) => (
  km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
);

const withDistance = (items) => {
  if (!searchOrigin.value) return items.map((item) => ({ ...item, distance: null }));
  const { latitude, longitude } = searchOrigin.value;
  return items.map((item) => ({
    ...item,
    distance: getDistanceKm(latitude, longitude, item.latitude, item.longitude),
  }));
};

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());
const searchResults = computed(() => {
  if (normalizedQuery.value.length < 2) return [];
  const query = normalizedQuery.value;
  return withDistance(locations.value.filter((item) => [
    item.title,
    item.parkName,
    item.address,
    item.newAddress,
    item.detailLocation,
  ].some((value) => String(value || '').toLowerCase().includes(query))))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
});

const placeResults = computed(() => {
  if (normalizedQuery.value.length < 2) return [];
  const query = normalizedQuery.value;
  return searchPlaces.filter((place) => [place.name, place.address, ...(place.aliases || [])]
    .some((value) => String(value || '').toLowerCase().includes(query))).slice(0, 4);
});

const nearbyLocations = computed(() => {
  return locationsWithinRadius(locations.value, searchOrigin.value, searchRadius.value);
});

const displayedLocations = computed(() => (
  mode.value === 'near' ? nearbyLocations.value : searchResults.value
));

const searchStatus = computed(() => {
  if (isLoading.value) return '음수대 정보를 불러오는 중...';
  if (mode.value === 'near') {
    if (isLocating.value) return '현재 위치를 확인하는 중...';
    const prefix = searchContextLabel.value ? `${searchContextLabel.value} 주변 · ` : '';
    return `${prefix}반경 ${formatDistance(searchRadius.value / 1000)} 내 음수대 ${displayedLocations.value.length}곳`;
  }
  if (!searchQuery.value) return '도시·공원·구·동 이름으로 검색하세요';
  if (normalizedQuery.value.length < 2) return '2글자 이상 입력하세요';
  if (!displayedLocations.value.length && placeResults.value.length) return '장소를 선택하면 주변 음수대를 보여드립니다';
  return `검색 결과 ${displayedLocations.value.length}곳`;
});

const fetchLocations = async () => {
  isLoading.value = true;
  try {
    officialLocations.value = await drinkingWaterData;
  } catch (error) {
    console.error('음수대 데이터 로드 실패:', error);
    officialLocations.value = [];
  } finally {
    isLoading.value = false;
  }
};

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const handleSearch = debounce(() => {
  mode.value = 'search';
  searchContextLabel.value = '';
  selectedId.value = null;
  const first = searchResults.value[0];
  centerLocation.value = first
    ? { latitude: first.latitude, longitude: first.longitude }
    : null;
}, 250);

const moveToPlace = (place) => {
  const position = { latitude: place.latitude, longitude: place.longitude };
  mode.value = 'near';
  searchQuery.value = place.name;
  searchContextLabel.value = place.name;
  selectedId.value = null;
  searchOrigin.value = { ...position };
  centerLocation.value = { ...position };
};

const moveToMatchedPlace = () => {
  if (placeResults.value[0]) moveToPlace(placeResults.value[0]);
};

const moveToCurrentLocation = async () => {
  mode.value = 'near';
  searchQuery.value = '';
  searchContextLabel.value = '';
  selectedId.value = null;
  isLocating.value = true;
  try {
    const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    searchOrigin.value = { ...position };
    centerLocation.value = { ...position };
  } catch (error) {
    console.warn('현재 위치 대신 한강 중심 위치를 사용합니다:', error);
    searchOrigin.value = { ...DEFAULT_POSITION };
    centerLocation.value = { ...DEFAULT_POSITION };
  } finally {
    isLocating.value = false;
  }
};

const handleLocationClick = (location) => {
  centerLocation.value = { latitude: location.latitude, longitude: location.longitude };
  selectedId.value = location.id;
};

const handleRegionChanged = (center) => {
  mode.value = 'near';
  searchQuery.value = '';
  selectedId.value = null;
  searchOrigin.value = { ...center };
  searchContextLabel.value = '지도 중심';
};

onMounted(async () => {
  window.addEventListener('share-water:update-status', handleUpdateStatus);
  initializeAdMob();
  document.addEventListener('visibilitychange', refreshSharedWater);
  sharedRefreshTimer = setInterval(refreshSharedWater, 60_000);
  void refreshSharedWater();
  await fetchLocations();
  await moveToCurrentLocation();
});

onUnmounted(() => {
  clearInterval(sharedRefreshTimer);
  document.removeEventListener('visibilitychange', refreshSharedWater);
  window.removeEventListener('share-water:update-status', handleUpdateStatus);
});
</script>

<template>
  <main class="container">
    <div v-if="updateMessage" class="update-overlay" role="status" aria-live="polite">
      <div class="update-card">
        <span class="update-spinner" aria-hidden="true"></span>
        <strong>{{ updateMessage }}</strong>
        <span>잠시만 기다려 주세요</span>
      </div>
    </div>
    <section class="map-container">
      <NaverMapMarker
        :locations="displayedLocations"
        :all-locations="locations"
        :selected-id="selectedId"
        :center="centerLocation"
        @region-changed="handleRegionChanged"
        @map-tap="sheetExpanded = false; selectedId = null"
        @info-open-changed="mapInfoOpen = $event"
        @add-water="openAddWater"
      />
      <div v-if="!mapInfoOpen" class="brand-badge"><span>💧</span> 모두의 음수대</div>
    </section>

    <section class="bottom-container" :class="{ expanded: sheetExpanded, collapsed: sheetCollapsed }">
      <button
        class="sheet-handle"
        type="button"
        :aria-label="sheetCollapsed ? '검색·목록 다시 열기' : (sheetExpanded ? '목록 기본 높이로 줄이기' : '목록 크게 펼치기')"
        :aria-expanded="!sheetCollapsed"
        aria-controls="water-search water-results"
        @pointerdown="startSheetGesture"
        @pointerup="endSheetGesture"
        @pointercancel="sheetPointer = null"
        @lostpointercapture="sheetPointer = null"
        @click="toggleSheet"
        @keydown.arrowdown.prevent="setSheetCollapsed(true)"
        @keydown.arrowup.prevent="setSheetCollapsed(false)"
      ><span></span><small v-if="sheetCollapsed">검색·목록 열기</small></button>

      <div id="water-search" class="search-container">
        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="도시·공원·구·동 검색 (예: 수원, 한강공원)"
          :disabled="isLoading"
          @input="handleSearch"
          @keyup.enter="moveToMatchedPlace"
        >
        <div v-if="mode === 'search' && placeResults.length" class="place-results">
          <button
            v-for="place in placeResults"
            :key="place.id"
            type="button"
            class="place-result-btn"
            @click="moveToPlace(place)"
          >
            <span>📍 {{ place.name }}</span>
            <small>{{ place.address }}</small>
          </button>
        </div>
        <div class="controls">
          <button
            class="near-btn"
            :class="{ active: mode === 'near' }"
            type="button"
            :disabled="isLoading || isLocating"
            @click="moveToCurrentLocation"
          >📍 내 주변</button>
          <select
            v-model.number="searchRadius"
            class="radius-select"
            aria-label="검색 반경"
          >
            <option v-for="radius in RADIUS_OPTIONS" :key="radius" :value="radius">
              {{ radius < 1000 ? `${radius}m` : `${radius / 1000}km` }}
            </option>
          </select>
        </div>
        <p class="search-info" :class="{ warning: mode === 'search' && normalizedQuery.length < 2 }">
          {{ searchStatus }}
        </p>
        <small v-if="sharedSyncError" class="shared-sync-error" role="status">{{ sharedSyncError }}</small>
        <div class="source-links">
          데이터 출처:
          <a
            class="source-link"
            href="https://data.seoul.go.kr/dataList/OA-20884/S/1/datasetView.do"
            target="_blank"
            rel="noopener noreferrer"
          >서울 열린데이터광장</a>
          ·
          <a
            class="source-link"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >OpenStreetMap</a>
          ·
          <a
            class="source-link"
            href="https://nyj.go.kr/www/contents.do?key=3178"
            target="_blank"
            rel="noopener noreferrer"
          >지자체 공식자료</a>
        </div>
      </div>

      <div id="water-results" class="list-scroll">
        <ul v-if="!isLoading && displayedLocations.length">
          <li
            v-for="location in displayedLocations"
            :key="location.id"
            class="location-item"
            :class="{ selected: selectedId === location.id }"
            @click="handleLocationClick(location)"
          >
            <div class="location-head">
              <h2>{{ location.title }}</h2>
              <span v-if="location.distance != null" class="distance-badge">
                {{ formatDistance(location.distance) }}
              </span>
            </div>
            <p v-if="location.detailLocation" class="detail">💧 {{ location.detailLocation }}</p>
            <p v-if="location.approximate" class="approximate-notice">⚠ 공원 대표 위치 · 개별 음수대 좌표 미확인</p>
            <p>{{ location.newAddress || location.address }}</p>
            <div v-if="location.custom" class="custom-water-actions">
              <small>{{ location.shared ? '사용자 공유 · 현장 확인 필요' : '직접 추가 · 내 기기 저장' }}</small>
              <button v-if="!location.shared" type="button" :disabled="isSavingWater" @click.stop="shareLocalWater(location)">전체 공개</button>
              <button v-if="!location.shared || location.owned" type="button" :disabled="isSavingWater" @click.stop="deleteWaterId = location.id; addWaterError = ''">삭제</button>
            </div>
          </li>
        </ul>
        <div v-else-if="isLoading" class="empty">음수대 정보를 불러오는 중입니다...</div>
        <div v-else class="empty">조건에 맞는 음수대가 없습니다.</div>
      </div>
    </section>
    <div v-if="addWaterPosition" class="water-dialog-backdrop" @click.self="!isSavingWater && (addWaterPosition = null)" @keydown.esc="!isSavingWater && (addWaterPosition = null)">
      <form class="water-dialog" role="dialog" aria-modal="true" aria-labelledby="add-water-title" @submit.prevent="addWater">
        <h2 id="add-water-title">이 위치에 음수대 추가</h2>
        <p>등록한 이름·위치·메모가 모든 사용자에게 공개됩니다.<br>실제 음수대만 등록해 주세요. 등록한 기기에서 삭제할 수 있습니다.</p>
        <small>{{ addWaterPosition.latitude.toFixed(6) }}, {{ addWaterPosition.longitude.toFixed(6) }}</small>
        <label>음수대 이름<input v-model="addWaterName" required maxlength="80" placeholder="예: 한강 산책로 음수대"></label>
        <label>위치 메모 (선택)<textarea v-model="addWaterMemo" maxlength="200" rows="2" placeholder="예: 화장실 옆, 자전거길 입구"></textarea></label>
        <p v-if="addWaterError" class="water-form-error" role="alert">{{ addWaterError }}</p>
        <div class="water-dialog-actions"><button type="button" :disabled="isSavingWater" @click="addWaterPosition = null">취소</button><button class="primary" type="submit" :disabled="isSavingWater">{{ isSavingWater ? '공유 중…' : '전체 공개로 추가' }}</button></div>
      </form>
    </div>
    <div v-if="deleteWaterId" class="water-dialog-backdrop" @click.self="deleteWaterId = null" @keydown.esc="deleteWaterId = null">
      <section class="water-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-water-title">
        <h2 id="delete-water-title">직접 추가한 음수대를 삭제할까요?</h2>
        <p>공유한 음수대는 모든 사용자의 목록에서 삭제됩니다. 공공데이터는 변경되지 않습니다.</p>
        <p v-if="addWaterError" class="water-form-error" role="alert">{{ addWaterError }}</p>
        <div class="water-dialog-actions"><button type="button" :disabled="isSavingWater" @click="deleteWaterId = null">취소</button><button class="primary" type="button" :disabled="isSavingWater" @click="deleteWater">{{ isSavingWater ? '삭제 중…' : '삭제' }}</button></div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.container { position: fixed; inset: 0 0 var(--admob-banner-height, 0px); display: flex; flex-direction: column; background: #eef8fb; color: #16333d; user-select: none; }
.map-container { position: relative; flex: 1; min-height: 240px; }
.brand-badge { position: absolute; z-index: 120; top: max(16px, env(safe-area-inset-top)); left: 16px; padding: 9px 14px; border-radius: 22px; background: rgba(255,255,255,.95); color: #087f8c; font-size: 15px; font-weight: 800; box-shadow: 0 2px 10px rgba(5, 77, 89, .2); }
.brand-badge span { margin-right: 4px; }
.bottom-container { height: 265px; padding: 12px; display: flex; gap: 12px; background: #eef8fb; border-top: 1px solid #cce8ed; }
.sheet-handle { display: none; }
.search-container { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(8,127,140,.1); }
.search-input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #b7dce2; border-radius: 8px; font-size: 14px; user-select: text; }
.search-input:focus { outline: 2px solid #9ddce4; border-color: #087f8c; }
.place-results { display: flex; flex-direction: column; gap: 4px; max-height: 112px; overflow-y: auto; }
.place-result-btn { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border: 1px solid #cce8ed; border-radius: 8px; background: #f4fbfc; color: #173d44; text-align: left; }
.place-result-btn span { font-size: 12px; font-weight: 750; }
.place-result-btn small { color: #607b80; font-size: 10px; }
.controls { display: flex; gap: 8px; }
.near-btn, .radius-select { height: 38px; border: 1px solid #1593a1; border-radius: 8px; background: white; color: #087f8c; font-weight: 700; }
.near-btn { flex: 1; }
.near-btn.active { background: #087f8c; color: white; }
.radius-select { width: 92px; padding: 0 7px; }
.search-info { margin: 0; text-align: center; color: #4f7178; font-size: 13px; }
.search-info.warning { color: #d65f3c; }
.source-links { margin-top: auto; padding: 3px; color: #52777e; text-align: center; font-size: 10px; }
.source-link { color: #52777e; text-decoration: underline; }
.list-scroll { flex: 1; overflow-y: auto; padding: 10px; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(8,127,140,.1); }
ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.location-item { padding: 11px; border: 1px solid transparent; border-radius: 10px; background: #f4fbfc; cursor: pointer; }
.location-item.selected { border-color: #0a93a2; background: #daf4f7; }
.location-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.location-item h2 { margin: 0 0 5px; color: #173d44; font-size: 14px; font-weight: 750; }
.location-item p { margin: 2px 0 0; color: #607b80; font-size: 12px; }
.location-item .detail { color: #087f8c; }
.location-item .approximate-notice { color: #b35b19; font-weight: 700; }
.distance-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 12px; background: #0a93a2; color: white; font-size: 11px; font-weight: 700; }
.empty { padding: 28px 12px; color: #71898e; text-align: center; }
.custom-water-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; color: #087f8c; }
.custom-water-actions button { padding: 5px 10px; border: 1px solid #cce8ed; border-radius: 8px; background: white; color: #a13f37; }
.shared-sync-error { color: #a13f37; font-size: 10px; text-align: center; }
.water-dialog-backdrop { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center; padding: 18px; background: #16333d80; }
.water-dialog { width: min(400px, 100%); max-height: 85dvh; overflow-y: auto; padding: 22px; border-radius: 16px; background: white; box-shadow: 0 5px 25px #16333d40; }
.water-dialog h2 { margin: 0 0 10px; font-size: 19px; }
.water-dialog p, .water-dialog small { color: #52777e; font-size: 13px; }
.water-dialog label { display: flex; flex-direction: column; gap: 6px; margin-top: 15px; font-size: 14px; }
.water-dialog input, .water-dialog textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #b7dce2; border-radius: 8px; font: inherit; user-select: text; }
.water-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.water-dialog-actions button { min-height: 44px; padding: 8px 20px; border: 1px solid #b7dce2; border-radius: 8px; background: white; color: #087f8c; font-weight: 700; }
.water-dialog-actions .primary { background: #087f8c; color: white; }
.water-dialog .water-form-error { color: #b33a30; }

.update-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(238,248,251,.94); backdrop-filter: blur(3px); }
.update-card { min-width: 220px; display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 27px 24px; border-radius: 16px; background: white; color: #16333d; box-shadow: 0 6px 24px rgba(5,77,89,.2); }
.update-card strong { font-size: 17px; }
.update-card span:last-child { color: #607b80; font-size: 13px; }
.update-spinner { width: 40px; height: 40px; border: 4px solid #cce8ed; border-top-color: #087f8c; border-radius: 50%; animation: update-spin .8s linear infinite; }
@keyframes update-spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .brand-badge { top: max(12px, env(safe-area-inset-top)); left: 12px; }
  .map-container { min-height: 180px; }
  .bottom-container { height: 292px; flex-direction: column; gap: 7px; padding: 6px 10px 10px; overflow: hidden; transition: height .25s ease; }
  .bottom-container.expanded { height: 82vh; }
  .bottom-container.collapsed { height: 32px; flex-shrink: 0; gap: 0; }
  .bottom-container.collapsed .search-container, .bottom-container.collapsed .list-scroll { display: none; }
  .sheet-handle { display: flex; flex: 0 0 32px; align-items: center; justify-content: center; flex-direction: column; gap: 3px; width: 100%; height: 32px; padding: 0; border: 0; background: transparent; touch-action: none; cursor: ns-resize; }
  .sheet-handle:focus-visible { outline: 2px solid #087f8c; border-radius: 8px; }
  .sheet-handle small { font-size: 10px; color: #52777e; }
  .sheet-handle span { width: 42px; height: 5px; border-radius: 3px; background: #a9c9ce; }
  .search-container { width: 100%; padding: 7px; gap: 6px; }
  .source-links { margin: 0; padding: 0; font-size: 9px; }
  .list-scroll { min-height: 0; padding: 7px; }
  ul { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .bottom-container { transition: none; }
}
</style>
