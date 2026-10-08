<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import NaverMapMarker from '@/components/NaverMapMarker.vue';
import { drinkingWaterData } from '@/assets/data.js';
import { searchPlaces } from '@/assets/searchPlaces.js';
import { getCurrentPosition } from '@/utils/geolocation.js';
import { initializeAdMob } from '@/services/adMob.js';
import { DEFAULT_SEARCH_RADIUS_METERS, SEARCH_RADIUS_OPTIONS } from '@/config.js';
import { getDistanceKm, locationsWithinRadius } from '@/utils/distance.js';

const DEFAULT_POSITION = { latitude: 37.5297, longitude: 126.9647 };
const configuredRadius = Number(import.meta.env.VITE_DEFAULT_RADIUS);
const DEFAULT_RADIUS = configuredRadius > 0 ? configuredRadius : DEFAULT_SEARCH_RADIUS_METERS;
const RADIUS_OPTIONS = SEARCH_RADIUS_OPTIONS;

const locations = ref([]);
const selectedId = ref(null);
const searchQuery = ref('');
const isLoading = ref(false);
const isLocating = ref(false);
const centerLocation = ref(null);
const searchOrigin = ref(null);
const searchRadius = ref(DEFAULT_RADIUS);
const mode = ref('near');
const sheetExpanded = ref(false);
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
    locations.value = await drinkingWaterData;
  } catch (error) {
    console.error('음수대 데이터 로드 실패:', error);
    locations.value = [];
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
  await fetchLocations();
  await moveToCurrentLocation();
});

onUnmounted(() => {
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
        :selected-id="selectedId"
        :center="centerLocation"
        @region-changed="handleRegionChanged"
        @map-tap="sheetExpanded = false; selectedId = null"
        @info-open-changed="mapInfoOpen = $event"
      />
      <div v-if="!mapInfoOpen" class="brand-badge"><span>💧</span> 모두의 음수대</div>
    </section>

    <section class="bottom-container" :class="{ expanded: sheetExpanded }">
      <button
        class="sheet-handle"
        type="button"
        :aria-label="sheetExpanded ? '목록 접기' : '목록 펼치기'"
        @click="sheetExpanded = !sheetExpanded"
      ><span></span></button>

      <div class="search-container">
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

      <div class="list-scroll">
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
          </li>
        </ul>
        <div v-else-if="isLoading" class="empty">음수대 정보를 불러오는 중입니다...</div>
        <div v-else class="empty">조건에 맞는 음수대가 없습니다.</div>
      </div>
    </section>
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
  .sheet-handle { display: flex; align-items: center; justify-content: center; height: 18px; padding: 0; border: 0; background: transparent; }
  .sheet-handle span { width: 42px; height: 5px; border-radius: 3px; background: #a9c9ce; }
  .search-container { width: 100%; padding: 7px; gap: 6px; }
  .source-links { margin: 0; padding: 0; font-size: 9px; }
  .list-scroll { min-height: 0; padding: 7px; }
  ul { grid-template-columns: 1fr; }
}
</style>
