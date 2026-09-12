<script setup>
import { computed, onMounted, ref } from 'vue';
import NaverMapMarker from '@/components/NaverMapMarker.vue';
import { drinkingWaterData } from '@/assets/data.js';
import { getCurrentPosition } from '@/utils/geolocation.js';
import { initializeAdMob } from '@/services/adMob.js';

const DEFAULT_POSITION = { latitude: 37.5297, longitude: 126.9647 };
const DEFAULT_RADIUS = Number(import.meta.env.VITE_DEFAULT_RADIUS) || 3000;
const RADIUS_OPTIONS = [500, 1000, 2000, 3000, 5000, 10000];

const locations = ref([]);
const selectedId = ref(null);
const searchQuery = ref('');
const isLoading = ref(false);
const isLocating = ref(false);
const centerLocation = ref(null);
const searchOrigin = ref(null);
const searchRadius = ref(DEFAULT_RADIUS);
const mode = ref('near');
const pendingRegion = ref(null);
const showSearchAreaBtn = ref(false);
const sheetExpanded = ref(false);

const deg2rad = (deg) => deg * (Math.PI / 180);
const distanceKm = (lat1, lon1, lat2, lon2) => {
  const radius = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (km) => (
  km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
);

const withDistance = (items) => {
  if (!searchOrigin.value) return items.map((item) => ({ ...item, distance: null }));
  const { latitude, longitude } = searchOrigin.value;
  return items.map((item) => ({
    ...item,
    distance: distanceKm(latitude, longitude, item.latitude, item.longitude),
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

const nearbyLocations = computed(() => {
  if (!searchOrigin.value) return [];
  return withDistance(locations.value)
    .filter((item) => item.distance <= searchRadius.value / 1000)
    .sort((a, b) => a.distance - b.distance);
});

const displayedLocations = computed(() => (
  mode.value === 'near' ? nearbyLocations.value : searchResults.value
));

const searchStatus = computed(() => {
  if (isLoading.value) return '음수대 정보를 불러오는 중...';
  if (mode.value === 'near') {
    if (isLocating.value) return '현재 위치를 확인하는 중...';
    return `반경 ${formatDistance(searchRadius.value / 1000)} 내 음수대 ${displayedLocations.value.length}곳`;
  }
  if (!searchQuery.value) return '공원·구·동 이름으로 검색하세요';
  if (normalizedQuery.value.length < 2) return '2글자 이상 입력하세요';
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
  selectedId.value = null;
  showSearchAreaBtn.value = false;
  const first = searchResults.value[0];
  centerLocation.value = first
    ? { latitude: first.latitude, longitude: first.longitude }
    : null;
}, 250);

const moveToCurrentLocation = async () => {
  mode.value = 'near';
  searchQuery.value = '';
  selectedId.value = null;
  showSearchAreaBtn.value = false;
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
  pendingRegion.value = center;
  if (!searchOrigin.value) {
    showSearchAreaBtn.value = true;
    return;
  }
  showSearchAreaBtn.value = distanceKm(
    searchOrigin.value.latitude,
    searchOrigin.value.longitude,
    center.latitude,
    center.longitude,
  ) > 0.1;
};

const searchThisArea = () => {
  if (!pendingRegion.value) return;
  mode.value = 'near';
  searchQuery.value = '';
  selectedId.value = null;
  searchOrigin.value = { ...pendingRegion.value };
  showSearchAreaBtn.value = false;
};

onMounted(async () => {
  initializeAdMob();
  await fetchLocations();
  await moveToCurrentLocation();
});
</script>

<template>
  <main class="container">
    <section class="map-container">
      <NaverMapMarker
        :locations="displayedLocations"
        :selected-id="selectedId"
        :center="centerLocation"
        @region-changed="handleRegionChanged"
        @map-tap="sheetExpanded = false; selectedId = null"
      />
      <div class="brand-badge"><span>💧</span> 모두의 음수대</div>
      <button v-if="showSearchAreaBtn" class="search-area-btn" @click="searchThisArea">
        이 근처 음수대 검색
      </button>
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
          placeholder="공원·구·동 검색 (예: 한강공원, 여의도)"
          :disabled="isLoading"
          @input="handleSearch"
        >
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
        <a
          class="source-link"
          href="https://data.seoul.go.kr/dataList/OA-20884/S/1/datasetView.do"
          target="_blank"
          rel="noopener noreferrer"
        >데이터 출처: 서울특별시 서울 열린데이터광장</a>
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
.brand-badge { position: absolute; z-index: 900; top: max(16px, env(safe-area-inset-top)); left: 16px; padding: 9px 14px; border-radius: 22px; background: rgba(255,255,255,.95); color: #087f8c; font-size: 15px; font-weight: 800; box-shadow: 0 2px 10px rgba(5, 77, 89, .2); }
.brand-badge span { margin-right: 4px; }
.search-area-btn { position: absolute; z-index: 900; top: max(62px, calc(env(safe-area-inset-top) + 46px)); left: 50%; transform: translateX(-50%); padding: 10px 17px; border: 0; border-radius: 22px; background: #087f8c; color: white; font-weight: 700; box-shadow: 0 3px 10px rgba(0,0,0,.22); white-space: nowrap; }
.bottom-container { height: 265px; padding: 12px; display: flex; gap: 12px; background: #eef8fb; border-top: 1px solid #cce8ed; }
.sheet-handle { display: none; }
.search-container { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(8,127,140,.1); }
.search-input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #b7dce2; border-radius: 8px; font-size: 14px; user-select: text; }
.search-input:focus { outline: 2px solid #9ddce4; border-color: #087f8c; }
.controls { display: flex; gap: 8px; }
.near-btn, .radius-select { height: 38px; border: 1px solid #1593a1; border-radius: 8px; background: white; color: #087f8c; font-weight: 700; }
.near-btn { flex: 1; }
.near-btn.active { background: #087f8c; color: white; }
.radius-select { width: 92px; padding: 0 7px; }
.search-info { margin: 0; text-align: center; color: #4f7178; font-size: 13px; }
.search-info.warning { color: #d65f3c; }
.source-link { margin-top: auto; padding: 3px; color: #52777e; text-align: center; font-size: 10px; text-decoration: underline; }
.list-scroll { flex: 1; overflow-y: auto; padding: 10px; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(8,127,140,.1); }
ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.location-item { padding: 11px; border: 1px solid transparent; border-radius: 10px; background: #f4fbfc; cursor: pointer; }
.location-item.selected { border-color: #0a93a2; background: #daf4f7; }
.location-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.location-item h2 { margin: 0 0 5px; color: #173d44; font-size: 14px; font-weight: 750; }
.location-item p { margin: 2px 0 0; color: #607b80; font-size: 12px; }
.location-item .detail { color: #087f8c; }
.distance-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 12px; background: #0a93a2; color: white; font-size: 11px; font-weight: 700; }
.empty { padding: 28px 12px; color: #71898e; text-align: center; }

@media (max-width: 768px) {
  .brand-badge { top: max(12px, env(safe-area-inset-top)); left: 12px; }
  .map-container { min-height: 180px; }
  .bottom-container { height: 292px; flex-direction: column; gap: 7px; padding: 6px 10px 10px; overflow: hidden; transition: height .25s ease; }
  .bottom-container.expanded { height: 82vh; }
  .sheet-handle { display: flex; align-items: center; justify-content: center; height: 18px; padding: 0; border: 0; background: transparent; }
  .sheet-handle span { width: 42px; height: 5px; border-radius: 3px; background: #a9c9ce; }
  .search-container { width: 100%; padding: 7px; gap: 6px; }
  .source-link { display: none; }
  .list-scroll { min-height: 0; padding: 7px; }
  ul { grid-template-columns: 1fr; }
}
</style>
