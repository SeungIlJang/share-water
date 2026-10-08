<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from '@/utils/geolocation.js';
import {
  buildNaverRouteAppUrl,
  buildNaverRouteWebUrl,
  MAX_NAVER_ROUTE_LOCATIONS,
} from '@/utils/naverNavigation.js';
import { fetchWalkingRoute } from '@/utils/walkingRoute.js';

const props = defineProps({
  locations: { type: Array, required: true },
  selectedId: { type: [String, Number], default: null },
  center: { type: Object, default: null },
});

const emit = defineEmits(['region-changed', 'map-tap', 'info-open-changed']);
const map = ref(null);
const markers = ref({});
const infoWindows = ref({});
const mapInitialized = ref(false);
const currentLocationMarker = ref(null);
const userPosition = ref(null);
const openInfoId = ref(null);
const routeLocations = ref([]);
const displayedRoute = ref(null);
const routeLoading = ref(false);
const routeError = ref('');
let mapDomElement;
let mapDomClickHandler;
let apiTimer;
let routePolyline;
let routeAbortController;

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatDistance = (km) => (
  km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
);

const formatWalkTime = (km) => `도보 약 ${Math.max(1, Math.round((km / 4.5) * 60))}분`;

const fullAddress = (location) => (
  location.newAddress || location.address || '주소 정보 없음'
);

const routeOrder = (id) => routeLocations.value.findIndex(
  (item) => String(item.id) === String(id),
) + 1;

const buildInfoContent = (location) => {
  const details = [
    location.detailLocation ? `💧 ${esc(location.detailLocation)}` : '',
    location.office ? `관리: ${esc(location.office)}` : '',
    location.approximate ? '⚠ 공원 대표 위치이며 개별 음수대 좌표는 공개되지 않았습니다.' : '',
    location.source ? `출처: ${esc(location.source)}` : '',
  ].filter(Boolean).map((item) => `<p>${item}</p>`).join('');
  const distance = location.distance != null
    ? `<p class="info-distance">${formatDistance(location.distance)} · ${formatWalkTime(location.distance)}</p>`
    : '';
  const address = fullAddress(location);
  const order = routeOrder(location.id);
  const routeLabel = order ? `경로빼기 (${order})` : '경로추가';

  return `
    <div class="info-window">
      <h3>${esc(location.title)}</h3>
      <p>${esc(address)}</p>
      ${details ? `<div class="info-rich">${details}</div>` : ''}
      ${distance}
      <div class="info-actions">
        <button class="info-btn route${order ? ' added' : ''}" type="button" onclick='window.__swToggleRoute(${JSON.stringify(String(location.id))})'>${order ? '✓' : '＋'} ${routeLabel}</button>
        <button class="info-btn navigate" type="button" onclick='window.__swNavigate(${location.latitude}, ${location.longitude}, ${JSON.stringify(location.title)})'>🧭 길찾기</button>
        <button class="info-btn copy" type="button" onclick='window.__swCopy(${JSON.stringify(address)})'>📋 주소복사</button>
      </div>
    </div>`;
};

const makeWaterIcon = (selected = false, approximate = false, order = 0) => ({
  content: `<div class="water-marker${selected ? ' selected' : ''}${approximate ? ' approximate' : ''}${order ? ' route-selected' : ''}" aria-label="${approximate ? '공원 단위 음수대 정보' : '음수대'}"><span>${approximate ? '🏞️' : '💧'}</span>${order ? `<b class="route-order">${order}</b>` : ''}</div>`,
  anchor: new naver.maps.Point(21, 21),
});

const smoothMoveMap = (position, zoom = null) => {
  if (!map.value) return;
  map.value.panTo(position, { duration: 450, easing: 'easeOutCubic' });
  if (zoom !== null && map.value.getZoom() !== zoom) map.value.setZoom(zoom);
};

const updateSelectedStyles = (id) => {
  openInfoId.value = id;
  emit('info-open-changed', Boolean(id));
  Object.entries(markers.value).forEach(([markerId, marker]) => {
    const selected = String(markerId) === String(id);
    const location = props.locations.find((item) => String(item.id) === String(markerId));
    const order = routeOrder(markerId);
    marker.setIcon(makeWaterIcon(selected, Boolean(location?.approximate), order));
    marker.setZIndex(selected ? 300 : order ? 220 : 100);
  });
};

const closeInfoWindows = () => {
  Object.values(infoWindows.value).forEach((info) => info.close());
  updateSelectedStyles(null);
};

const showInfoWindow = (id) => {
  closeInfoWindows();
  const marker = markers.value[id];
  const info = infoWindows.value[id];
  if (!marker || !info) return;
  info.open(map.value, marker);
  updateSelectedStyles(id);
  smoothMoveMap(marker.getPosition());
};

const toggleInfoWindow = (id) => {
  document.activeElement?.blur?.();
  if (infoWindows.value[id]?.getMap()) closeInfoWindows();
  else showInfoWindow(id);
};

const renderCurrentLocation = () => {
  if (!map.value || !userPosition.value) return;
  currentLocationMarker.value?.setMap(null);
  currentLocationMarker.value = new naver.maps.Marker({
    position: new naver.maps.LatLng(userPosition.value.latitude, userPosition.value.longitude),
    map: map.value,
    icon: {
      content: '<div class="current-location-marker"><div class="pulse"></div><div class="pin"></div></div>',
      anchor: new naver.maps.Point(15, 15),
    },
    zIndex: 250,
  });
};

const showCurrentLocation = async () => {
  try {
    userPosition.value = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    renderCurrentLocation();
    smoothMoveMap(new naver.maps.LatLng(userPosition.value.latitude, userPosition.value.longitude));
  } catch (error) {
    console.error('현재 위치 조회 실패:', error);
    alert('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.');
  }
};

const createMarkers = () => {
  Object.values(markers.value).forEach((marker) => marker.setMap(null));
  Object.values(infoWindows.value).forEach((info) => info.close());
  markers.value = {};
  infoWindows.value = {};
  if (!map.value) return;

  props.locations.forEach((location) => {
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(location.latitude, location.longitude),
      map: map.value,
      title: location.title,
      icon: makeWaterIcon(
        String(location.id) === String(props.selectedId),
        Boolean(location.approximate),
        routeOrder(location.id),
      ),
      zIndex: 100,
    });
    const info = new naver.maps.InfoWindow({
      content: buildInfoContent(location),
      zIndex: 150,
      maxWidth: 280,
      backgroundColor: 'transparent',
      borderWidth: 0,
      disableAnchor: true,
      pixelOffset: new naver.maps.Point(0, -8),
    });
    naver.maps.Event.addListener(marker, 'click', () => toggleInfoWindow(location.id));
    markers.value[location.id] = marker;
    infoWindows.value[location.id] = info;
  });

  if (props.selectedId && markers.value[props.selectedId]) showInfoWindow(props.selectedId);
  renderCurrentLocation();
};

const emitRegionChanged = () => {
  if (!map.value) return;
  const center = map.value.getCenter();
  emit('region-changed', { latitude: center.lat(), longitude: center.lng() });
};

const handleMapTap = () => {
  closeInfoWindows();
  document.activeElement?.blur?.();
  emit('map-tap');
};

const initMap = async () => {
  let position = { latitude: 37.5297, longitude: 126.9647 };
  try {
    position = await getCurrentPosition({ timeout: 5000 });
    userPosition.value = { ...position };
  } catch (error) {
    console.warn('기본 지도 위치를 사용합니다:', error);
  }

  map.value = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(position.latitude, position.longitude),
    zoom: 15,
  });
  naver.maps.Event.addListener(map.value, 'click', handleMapTap);
  naver.maps.Event.addListener(map.value, 'dragend', emitRegionChanged);
  naver.maps.Event.addListener(map.value, 'zoom_changed', emitRegionChanged);

  mapDomElement = document.getElementById('map');
  mapDomClickHandler = (event) => {
    if (!event.target.closest('.water-marker, .info-window')) handleMapTap();
  };
  mapDomElement?.addEventListener('click', mapDomClickHandler, true);
  mapInitialized.value = true;
  await nextTick();
  createMarkers();
};

const showToast = (message) => {
  const toast = document.createElement('div');
  toast.className = 'sw-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 1400);
};

const refreshOpenInfoWindow = () => {
  const id = openInfoId.value;
  if (!id || !infoWindows.value[id]) return;
  const location = props.locations.find((item) => String(item.id) === String(id));
  if (location) infoWindows.value[id].setContent(buildInfoContent(location));
};

const toggleRouteLocation = (id) => {
  clearDisplayedRoute();
  const index = routeLocations.value.findIndex((item) => String(item.id) === String(id));
  if (index >= 0) {
    routeLocations.value.splice(index, 1);
  } else {
    const location = props.locations.find((item) => String(item.id) === String(id));
    if (!location) return;
    if (routeLocations.value.length >= MAX_NAVER_ROUTE_LOCATIONS) {
      showToast(`네이버 지도 경로에는 최대 ${MAX_NAVER_ROUTE_LOCATIONS}곳까지 추가할 수 있습니다`);
      return;
    }
    routeLocations.value.push({ ...location });
  }
  updateSelectedStyles(openInfoId.value);
  refreshOpenInfoWindow();
};

const clearRoute = () => {
  routeAbortController?.abort();
  routeAbortController = null;
  routePolyline?.setMap(null);
  routePolyline = null;
  routeLocations.value = [];
  displayedRoute.value = null;
  routeLoading.value = false;
  routeError.value = '';
  updateSelectedStyles(openInfoId.value);
  refreshOpenInfoWindow();
};

const clearDisplayedRoute = () => {
  routeAbortController?.abort();
  routeAbortController = null;
  routePolyline?.setMap(null);
  routePolyline = null;
  displayedRoute.value = null;
  routeLoading.value = false;
  routeError.value = '';
};

const fitRouteOnMap = (coordinates) => {
  if (!map.value || !coordinates.length) return;
  const bounds = new naver.maps.LatLngBounds();
  coordinates.forEach(({ latitude, longitude }) => {
    bounds.extend(new naver.maps.LatLng(latitude, longitude));
  });
  map.value.fitBounds(bounds, 70);
};

const showSelectedRoute = async () => {
  if (routeLocations.value.length < 2) {
    showToast('음수대를 2곳 이상 선택해주세요');
    return;
  }

  clearDisplayedRoute();
  closeInfoWindows();
  routeLoading.value = true;
  const abortController = new AbortController();
  routeAbortController = abortController;
  const selectedIds = routeLocations.value.map(({ id }) => String(id)).join('|');

  try {
    const result = await fetchWalkingRoute(routeLocations.value, {
      apiUrl: import.meta.env.VITE_ROUTING_API_URL,
      signal: abortController.signal,
    });
    if (selectedIds !== routeLocations.value.map(({ id }) => String(id)).join('|')) return;

    const path = result.coordinates.map(
      ({ latitude, longitude }) => new naver.maps.LatLng(latitude, longitude),
    );
    routePolyline = new naver.maps.Polyline({
      map: map.value,
      path,
      strokeColor: '#087f8c',
      strokeOpacity: 0.92,
      strokeWeight: 7,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      zIndex: 180,
    });
    displayedRoute.value = result;
    fitRouteOnMap(result.coordinates);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('보행 경로 조회 실패:', error);
    routeError.value = '경로를 불러오지 못했습니다';
    showToast('보행 경로를 불러오지 못했습니다. 다시 시도해주세요');
  } finally {
    if (routeAbortController === abortController) {
      routeLoading.value = false;
      routeAbortController = null;
    }
  }
};

const openNaverRoute = async (locations) => {
  if (!locations.length) return;

  const webUrl = buildNaverRouteWebUrl(locations);
  if (!Capacitor.isNativePlatform()) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const { AppLauncher } = await import('@capacitor/app-launcher');
  const probe = Capacitor.getPlatform() === 'android' ? 'com.nhn.android.nmap' : 'nmap://route';
  try {
    const naverMapInstalled = (await AppLauncher.canOpenUrl({ url: probe })).value;
    const launchUrl = naverMapInstalled
      ? buildNaverRouteAppUrl(locations)
      : webUrl;
    const result = await AppLauncher.openUrl({ url: launchUrl });
    if (!result.completed && launchUrl !== webUrl) await AppLauncher.openUrl({ url: webUrl });
  } catch (error) {
    await AppLauncher.openUrl({ url: webUrl });
  }
};

const navigateSelectedRoute = () => {
  if (routeLocations.value.length < 2) {
    showToast('음수대를 2곳 이상 선택해주세요');
    return;
  }
  openNaverRoute(routeLocations.value);
};

const registerHelpers = () => {
  window.__swToggleRoute = toggleRouteLocation;

  window.__swNavigate = async (lat, lng, name) => {
    if (routeLocations.value.length >= 2) {
      await openNaverRoute(routeLocations.value);
      return;
    }
    await openNaverRoute([{ latitude: lat, longitude: lng, title: name }]);
  };

  window.__swCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('주소를 복사했습니다');
    } catch (error) {
      showToast('주소 복사에 실패했습니다');
    }
  };
};

watch(() => props.locations, async () => {
  if (!mapInitialized.value) return;
  await nextTick();
  createMarkers();
}, { deep: true });

watch(() => props.selectedId, (id) => {
  if (id && mapInitialized.value) showInfoWindow(id);
});

watch(() => props.center, (center) => {
  if (!center || !map.value) return;
  smoothMoveMap(new naver.maps.LatLng(center.latitude, center.longitude), 15);
}, { deep: true });

onMounted(() => {
  registerHelpers();
  if (window.naver?.maps) initMap();
  else {
    apiTimer = setInterval(() => {
      if (!window.naver?.maps) return;
      clearInterval(apiTimer);
      initMap();
    }, 400);
    setTimeout(() => clearInterval(apiTimer), 10000);
  }
});

onUnmounted(() => {
  clearInterval(apiTimer);
  routeAbortController?.abort();
  routePolyline?.setMap(null);
  mapDomElement?.removeEventListener('click', mapDomClickHandler, true);
  delete window.__swToggleRoute;
  delete window.__swNavigate;
  delete window.__swCopy;
});
</script>

<template>
  <div class="map-viewport">
    <div id="map" class="map-view"></div>
  </div>
  <div v-if="routeLocations.length && !openInfoId" class="route-panel">
    <div class="route-summary">
      <strong>{{ routeLocations.length === 1 ? '경로 이어하기' : `선택 경로 ${routeLocations.length}곳` }}</strong>
      <span v-if="routeLoading">경로 계산 중…</span>
      <span v-else-if="displayedRoute">{{ formatDistance(displayedRoute.distanceKm) }} · 도보 약 {{ displayedRoute.durationMinutes }}분</span>
      <span v-else-if="routeError">{{ routeError }}</span>
      <span v-else>{{ routeLocations.length === 1 ? '다음 음수대를 선택하세요' : '경로를 확인하세요' }}</span>
    </div>
    <div class="route-actions">
      <button type="button" class="route-clear-btn" @click="clearRoute">초기화</button>
      <button
        type="button"
        class="route-map-btn"
        :disabled="routeLocations.length < 2 || routeLoading"
        @click="showSelectedRoute"
      >{{ routeLoading ? '계산중' : '경로' }}</button>
      <button
        type="button"
        class="route-show-btn"
        :disabled="routeLocations.length < 2"
        @click="navigateSelectedRoute"
      >길찾기</button>
    </div>
  </div>
  <button class="current-location-btn" type="button" title="현재 위치로 이동" @click="showCurrentLocation">
    <span></span>
  </button>
</template>

<style scoped>
.map-viewport { position: absolute; inset: 0; overflow: hidden; }
.map-view { position: absolute; inset: 0; width: 100%; height: 100%; }
.current-location-btn { position: absolute; right: 18px; bottom: 18px; z-index: 800; width: 44px; height: 44px; border: 1px solid #c7dfe3; border-radius: 50%; background: white; box-shadow: 0 2px 7px rgba(0,0,0,.18); }
.current-location-btn span { display: block; width: 22px; height: 22px; margin: auto; border: 3px solid #0a93a2; border-radius: 50%; position: relative; }
.current-location-btn span::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: #0a93a2; }
.route-panel { position: absolute; z-index: 850; top: max(108px, calc(env(safe-area-inset-top) + 92px)); left: 50%; display: flex; align-items: center; gap: 8px; width: min(560px, calc(100% - 24px)); box-sizing: border-box; padding: 8px 9px 8px 13px; border: 1px solid #b8dfe4; border-radius: 14px; background: rgba(255,255,255,.96); box-shadow: 0 3px 12px rgba(0,61,72,.22); transform: translateX(-50%); }
.route-summary { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; color: #173d44; white-space: nowrap; }
.route-summary strong { font-size: 13px; }
.route-summary span { overflow: hidden; color: #087f8c; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.route-actions { display: flex; gap: 5px; }
.route-actions button { min-width: 54px; height: 34px; padding: 0 9px; border-radius: 8px; font-size: 12px; font-weight: 800; white-space: nowrap; }
.route-clear-btn { border: 1px solid #bfdde1; background: white; color: #607b80; }
.route-map-btn { border: 1px solid #087f8c; background: white; color: #087f8c; }
.route-show-btn { border: 1px solid #087f8c; background: #087f8c; color: white; }
.route-actions button:disabled { border-color: #b8c9cc; background: #b8c9cc; color: white; cursor: not-allowed; }
@media (max-width: 430px) {
  .route-panel { gap: 6px; padding-left: 11px; }
  .route-actions { gap: 4px; }
  .route-actions button { min-width: 48px; padding: 0 7px; font-size: 11px; }
}
:deep(.water-marker) { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 2px solid #0a93a2; border-radius: 50% 50% 50% 8px; background: white; box-shadow: 0 2px 7px rgba(0,61,72,.32); transform: rotate(-45deg); transition: transform .15s; cursor: pointer; }
:deep(.water-marker span) { font-size: 23px; line-height: 1; transform: rotate(45deg); }
:deep(.water-marker.selected) { border-width: 3px; background: #d8f6fa; box-shadow: 0 0 0 4px rgba(10,147,162,.28), 0 3px 9px rgba(0,61,72,.38); transform: rotate(-45deg) scale(1.25); }
:deep(.water-marker.route-selected) { border-color: #ef3f43; background: #fff1f1; }
:deep(.water-marker .route-order) { position: absolute; top: -9px; right: -9px; display: flex; align-items: center; justify-content: center; width: 21px; height: 21px; border: 2px solid white; border-radius: 50%; background: #ef3f43; color: white; font-size: 11px; font-weight: 900; transform: rotate(45deg); box-shadow: 0 1px 4px rgba(0,0,0,.25); }
:deep(.water-marker.approximate) { border-style: dashed; border-color: #d87928; background: #fff8ef; }
:deep(.info-window) { box-sizing: border-box; min-width: 220px; padding: 14px; border: 1px solid #d6e7e9; border-radius: 12px; background: white; color: #24474e; box-shadow: 0 3px 12px rgba(0,61,72,.22); }
:deep(.info-window h3) { margin: 0 0 7px; color: #173d44; font-size: 16px; }
:deep(.info-window p) { margin: 2px 0; color: #60777c; font-size: 13px; }
:deep(.info-window .info-rich) { margin-top: 7px; padding-top: 7px; border-top: 1px solid #dcecee; }
:deep(.info-window .info-distance) { margin-top: 7px; color: #087f8c; font-weight: 700; }
:deep(.info-actions) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 11px; }
:deep(.info-btn) { min-width: 0; height: 34px; border-radius: 7px; font-size: 12px; font-weight: 700; white-space: nowrap; }
:deep(.info-btn.route) { border: 1px solid #087f8c; background: #087f8c; color: white; }
:deep(.info-btn.route.added) { border-color: #ef3f43; background: #ef3f43; }
:deep(.info-btn.navigate) { border: 1px solid #087f8c; background: white; color: #087f8c; }
:deep(.info-btn.copy) { grid-column: 1 / -1; border: 1px solid #087f8c; background: white; color: #087f8c; }
:deep(.current-location-marker) { position: relative; width: 30px; height: 30px; }
:deep(.current-location-marker .pin) { position: absolute; top: 8px; left: 8px; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; background: #4285f4; }
:deep(.current-location-marker .pulse) { position: absolute; width: 30px; height: 30px; border-radius: 50%; background: rgba(66,133,244,.25); animation: pulse 2s infinite; }
@keyframes pulse { 0% { transform: scale(.5); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
</style>

<style>
.sw-toast { position: fixed; z-index: 3000; bottom: 90px; left: 50%; padding: 10px 17px; border-radius: 22px; background: rgba(0,0,0,.82); color: white; opacity: 0; transform: translate(-50%, 10px); transition: .25s; }
.sw-toast.show { opacity: 1; transform: translate(-50%, 0); }
</style>
