<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from '@/utils/geolocation.js';
import {
  buildNaverRouteAppUrl,
  buildNaverRouteWebUrl,
  MAX_NAVER_ROUTE_LOCATIONS,
} from '@/utils/naverNavigation.js';
import { fetchWalkingDistances, fetchWalkingRoute } from '@/utils/walkingRoute.js';
import { createAutomaticCourse } from '@/utils/coursePlanner.js';
import { buildGpx, createGpxFilename } from '@/utils/gpx.js';
import { saveOrShareGpx } from '@/utils/gpxShare.js';
import { visibleAreaRatio } from '@/utils/visibility.js';

const props = defineProps({
  locations: { type: Array, required: true },
  allLocations: { type: Array, default: () => [] },
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
const gpxPanelOpen = ref(false);
const gpxOriginMode = ref('current');
const gpxTargetDistance = ref(5);
const automaticCourse = ref(null);
const gpxLoading = ref(false);
const gpxSharing = ref(false);
const routeFocusMode = ref(false);
let mapDomElement;
let mapDomClickHandler;
let apiTimer;
let routePolyline;
let routeAbortController;
let retainedInfoLocation;
let mapDragging = false;
let suppressMapTapUntil = 0;
let visibilityFrame;

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
  retainedInfoLocation = null;
  updateSelectedStyles(null);
};

const findLocation = (id) => props.locations.find((item) => String(item.id) === String(id))
  || routeLocations.value.find((item) => String(item.id) === String(id))
  || (String(retainedInfoLocation?.id) === String(id) ? retainedInfoLocation : null);

const showInfoWindow = (id, moveToMarker = true) => {
  const location = findLocation(id);
  closeInfoWindows();
  const marker = markers.value[id];
  const info = infoWindows.value[id];
  if (!marker || !info) return;
  retainedInfoLocation = location;
  info.open(map.value, marker);
  updateSelectedStyles(id);
  if (moveToMarker) smoothMoveMap(marker.getPosition());
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
  const activeInfoId = openInfoId.value;
  const activeInfoLocation = activeInfoId ? findLocation(activeInfoId) : null;
  Object.values(markers.value).forEach((marker) => marker.setMap(null));
  Object.values(infoWindows.value).forEach((info) => info.close());
  markers.value = {};
  infoWindows.value = {};
  if (!map.value) return;

  const baseLocations = routeFocusMode.value ? routeLocations.value : props.locations;
  const markerLocations = [...baseLocations];
  if (
    activeInfoLocation
    && !markerLocations.some(({ id }) => String(id) === String(activeInfoLocation.id))
  ) markerLocations.push(activeInfoLocation);

  markerLocations.forEach((location) => {
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

  if (activeInfoId && markers.value[activeInfoId]) showInfoWindow(activeInfoId, false);
  else if (props.selectedId && markers.value[props.selectedId]) showInfoWindow(props.selectedId);
  renderCurrentLocation();
};

const emitRegionChanged = () => {
  if (!map.value) return;
  const center = map.value.getCenter();
  emit('region-changed', { latitude: center.lat(), longitude: center.lng() });
};

const handleMapTap = () => {
  if (mapDragging || Date.now() < suppressMapTapUntil) return;
  closeInfoWindows();
  document.activeElement?.blur?.();
  emit('map-tap');
};

const checkInfoWindowVisibility = () => {
  cancelAnimationFrame(visibilityFrame);
  visibilityFrame = requestAnimationFrame(() => {
    if (!openInfoId.value || !mapDomElement) return;
    const infoElement = mapDomElement.querySelector('.info-window');
    if (!infoElement) return;
    const ratio = visibleAreaRatio(
      infoElement.getBoundingClientRect(),
      mapDomElement.getBoundingClientRect(),
    );
    if (ratio <= 0.1) closeInfoWindows();
  });
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
  naver.maps.Event.addListener(map.value, 'dragstart', () => { mapDragging = true; });
  naver.maps.Event.addListener(map.value, 'dragend', () => {
    mapDragging = false;
    suppressMapTapUntil = Date.now() + 250;
    emitRegionChanged();
    checkInfoWindowVisibility();
  });
  naver.maps.Event.addListener(map.value, 'bounds_changed', checkInfoWindowVisibility);
  naver.maps.Event.addListener(map.value, 'zoom_changed', () => {
    emitRegionChanged();
    checkInfoWindowVisibility();
  });

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
  const location = findLocation(id);
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
  createMarkers();
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
  automaticCourse.value = null;
  gpxLoading.value = false;
  routeFocusMode.value = false;
  updateSelectedStyles(openInfoId.value);
  refreshOpenInfoWindow();
  createMarkers();
};

const clearDisplayedRoute = () => {
  routeAbortController?.abort();
  routeAbortController = null;
  routePolyline?.setMap(null);
  routePolyline = null;
  displayedRoute.value = null;
  routeLoading.value = false;
  routeError.value = '';
  automaticCourse.value = null;
  routeFocusMode.value = false;
};

const fitRouteOnMap = (coordinates) => {
  if (!map.value || !coordinates.length) return;
  const bounds = new naver.maps.LatLngBounds();
  coordinates.forEach(({ latitude, longitude }) => {
    bounds.extend(new naver.maps.LatLng(latitude, longitude));
  });
  map.value.fitBounds(bounds, 70);
};

const drawRoute = (result, color = '#087f8c') => {
  const path = result.coordinates.map(
    ({ latitude, longitude }) => new naver.maps.LatLng(latitude, longitude),
  );
  routePolyline = new naver.maps.Polyline({
    map: map.value,
    path,
    strokeColor: color,
    strokeOpacity: 0.92,
    strokeWeight: 7,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    zIndex: 180,
  });
  displayedRoute.value = result;
  fitRouteOnMap(result.coordinates);
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

    drawRoute(result);
    routeFocusMode.value = true;
    createMarkers();
    return result;
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('보행 경로 조회 실패:', error);
    routeError.value = '경로를 불러오지 못했습니다';
    showToast('보행 경로를 불러오지 못했습니다. 다시 시도해주세요');
    return null;
  } finally {
    if (routeAbortController === abortController) {
      routeLoading.value = false;
      routeAbortController = null;
    }
  }
};

const currentMapCenter = () => {
  const center = map.value?.getCenter?.();
  return center ? { latitude: center.lat(), longitude: center.lng(), title: '지도 중심' } : null;
};

const resolveCourseOrigin = async () => {
  if (gpxOriginMode.value === 'center') return currentMapCenter();
  if (!userPosition.value) {
    userPosition.value = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    renderCurrentLocation();
  }
  return { ...userPosition.value, title: '현재 위치' };
};

const generateGpxCourse = async (reroll = false) => {
  const excludedId = reroll ? automaticCourse.value?.stops?.[0]?.id : null;
  routeAbortController?.abort();
  clearDisplayedRoute();
  routeLocations.value = [];
  updateSelectedStyles(null);
  closeInfoWindows();
  gpxLoading.value = true;
  routeLoading.value = true;
  routeError.value = '';
  const abortController = new AbortController();
  routeAbortController = abortController;

  try {
    const origin = await resolveCourseOrigin();
    if (!origin) throw new Error('출발점을 확인할 수 없습니다.');
    const candidateLocations = props.allLocations.length ? props.allLocations : props.locations;
    const result = await createAutomaticCourse({
      origin,
      locations: excludedId
        ? candidateLocations.filter(({ id }) => String(id) !== String(excludedId))
        : candidateLocations,
      targetDistanceKm: gpxTargetDistance.value,
      signal: abortController.signal,
      fetchDistances: (courseOrigin, targets, options = {}) => fetchWalkingDistances(
        courseOrigin,
        targets,
        {
          apiUrl: import.meta.env.VITE_ROUTING_API_URL,
          signal: options.signal,
        },
      ),
      fetchRoute: (points, options = {}) => fetchWalkingRoute(points, {
        apiUrl: import.meta.env.VITE_ROUTING_API_URL,
        signal: options.signal,
      }),
    });
    if (routeAbortController !== abortController) return;

    routeLocations.value = result.stops.map((stop) => ({ ...stop }));
    automaticCourse.value = result;
    drawRoute(result, '#ef3f43');
    routeFocusMode.value = true;
    createMarkers();
    gpxPanelOpen.value = false;
    showToast(`${formatDistance(result.distanceKm)} 왕복 코스를 만들었습니다`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('GPX 자동 코스 생성 실패:', error);
    routeError.value = error?.message || '자동 코스를 만들지 못했습니다';
    showToast(routeError.value);
  } finally {
    if (routeAbortController === abortController) {
      routeAbortController = null;
      routeLoading.value = false;
      gpxLoading.value = false;
    }
  }
};

const shareRouteGpx = async (route, waypoints, name) => {
  if (!route || gpxSharing.value) return;
  gpxSharing.value = true;
  try {
    const filename = createGpxFilename();
    const content = buildGpx({
      name,
      coordinates: route.coordinates,
      waypoints,
    });
    const action = await saveOrShareGpx({ filename, content });
    showToast(action === 'downloaded' ? 'GPX 파일을 저장했습니다' : 'GPX 공유 화면을 열었습니다');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('GPX 저장·공유 실패:', error);
      showToast('GPX 파일을 저장하지 못했습니다');
    }
  } finally {
    gpxSharing.value = false;
  }
};

const shareAutomaticCourse = () => shareRouteGpx(
  automaticCourse.value,
  automaticCourse.value?.stops || [],
  `모두의 음수대 ${formatDistance(automaticCourse.value?.distanceKm || 0)} 왕복 코스`,
);

const shareSelectedRoute = async () => {
  if (routeLocations.value.length < 2) {
    showToast('음수대를 2곳 이상 선택해주세요');
    return;
  }
  const route = displayedRoute.value || await showSelectedRoute();
  if (!route) return;
  await shareRouteGpx(
    route,
    routeLocations.value,
    `모두의 음수대 ${formatDistance(route.distanceKm)} 선택 경로`,
  );
};

const openGpxPanel = () => {
  closeInfoWindows();
  gpxPanelOpen.value = true;
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
  cancelAnimationFrame(visibilityFrame);
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
      <strong v-if="automaticCourse">GPX 왕복 코스 · 음수대 {{ routeLocations.length }}곳</strong>
      <strong v-else>{{ routeLocations.length === 1 ? '경로 이어하기' : `선택 경로 ${routeLocations.length}곳` }}</strong>
      <span v-if="routeLoading">경로 계산 중…</span>
      <span v-else-if="displayedRoute">{{ formatDistance(displayedRoute.distanceKm) }} · 도보 약 {{ displayedRoute.durationMinutes }}분</span>
      <span v-else-if="routeError">{{ routeError }}</span>
      <span v-else>{{ routeLocations.length === 1 ? '다음 음수대를 선택하세요' : '경로를 확인하세요' }}</span>
    </div>
    <div v-if="automaticCourse" class="route-actions gpx-result-actions">
      <button type="button" class="route-clear-btn" @click="clearRoute">초기화</button>
      <button type="button" class="route-map-btn" :disabled="gpxSharing" @click="shareAutomaticCourse">
        {{ gpxSharing ? '준비중' : 'GPX 저장' }}
      </button>
      <button type="button" class="route-show-btn" :disabled="gpxLoading" @click="generateGpxCourse(true)">다시</button>
    </div>
    <div v-else class="route-actions manual-route-actions">
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
      <button
        type="button"
        class="route-gpx-btn"
        :disabled="routeLocations.length < 2 || routeLoading || gpxSharing"
        @click="shareSelectedRoute"
      >{{ gpxSharing ? '준비중' : 'GPX' }}</button>
    </div>
  </div>
  <button class="gpx-open-btn" type="button" @click="openGpxPanel">GPX</button>
  <div v-if="gpxPanelOpen" class="gpx-dialog-backdrop" @click.self="gpxPanelOpen = false">
    <section class="gpx-dialog" role="dialog" aria-modal="true" aria-labelledby="gpx-dialog-title">
      <button class="gpx-close-btn" type="button" aria-label="닫기" @click="gpxPanelOpen = false">×</button>
      <h2 id="gpx-dialog-title">음수대 왕복 코스 만들기</h2>
      <p>주변 음수대를 경유하는 실제 보행 코스를 자동으로 만듭니다.</p>
      <fieldset>
        <legend>출발점</legend>
        <label><input v-model="gpxOriginMode" type="radio" value="current"> 현재 위치</label>
        <label><input v-model="gpxOriginMode" type="radio" value="center"> 지도 중심</label>
      </fieldset>
      <fieldset>
        <legend>목표 거리</legend>
        <label v-for="distance in [3, 5, 10]" :key="distance" class="distance-option">
          <input v-model.number="gpxTargetDistance" type="radio" :value="distance">
          <span>{{ distance }}km</span>
        </label>
      </fieldset>
      <button class="gpx-generate-btn" type="button" :disabled="gpxLoading" @click="generateGpxCourse(false)">
        {{ gpxLoading ? '코스 계산 중…' : '코스 만들기' }}
      </button>
      <small>실제 보행로에 따라 완성 거리는 목표와 다를 수 있습니다.</small>
    </section>
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
.gpx-open-btn { position: absolute; z-index: 820; top: max(62px, calc(env(safe-area-inset-top) + 50px)); left: 16px; min-width: 58px; height: 38px; border: 0; border-radius: 19px; background: #ef3f43; color: white; font-size: 13px; font-weight: 900; box-shadow: 0 2px 8px rgba(115,18,23,.28); }
.gpx-dialog-backdrop { position: absolute; z-index: 1100; inset: 0; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(8,40,46,.42); }
.gpx-dialog { position: relative; width: min(390px, 100%); padding: 22px; border-radius: 18px; background: white; color: #173d44; box-shadow: 0 12px 36px rgba(0,38,45,.3); }
.gpx-dialog h2 { margin: 0 28px 5px 0; font-size: 20px; font-weight: 900; }
.gpx-dialog > p { margin: 0 0 17px; color: #607b80; font-size: 13px; }
.gpx-close-btn { position: absolute; top: 10px; right: 12px; width: 34px; height: 34px; border: 0; background: transparent; color: #607b80; font-size: 28px; }
.gpx-dialog fieldset { display: flex; gap: 9px; margin: 0 0 14px; padding: 11px; border: 1px solid #cce8ed; border-radius: 11px; }
.gpx-dialog legend { padding: 0 5px; color: #087f8c; font-size: 12px; font-weight: 900; }
.gpx-dialog label { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; }
.gpx-dialog input { accent-color: #ef3f43; }
.gpx-dialog .distance-option { flex: 1; }
.gpx-dialog .distance-option span { display: flex; flex: 1; align-items: center; justify-content: center; height: 36px; border: 1px solid #d4e7ea; border-radius: 9px; }
.gpx-dialog .distance-option input { position: absolute; opacity: 0; }
.gpx-dialog .distance-option input:checked + span { border-color: #ef3f43; background: #fff1f1; color: #d9272e; }
.gpx-generate-btn { width: 100%; height: 46px; border: 0; border-radius: 11px; background: #ef3f43; color: white; font-size: 15px; font-weight: 900; }
.gpx-generate-btn:disabled { background: #b8c9cc; }
.gpx-dialog small { display: block; margin-top: 9px; color: #71888d; text-align: center; font-size: 10px; }
.route-panel { position: absolute; z-index: 850; top: max(108px, calc(env(safe-area-inset-top) + 92px)); left: 50%; display: flex; align-items: center; gap: 8px; width: min(560px, calc(100% - 24px)); box-sizing: border-box; padding: 8px 9px 8px 13px; border: 1px solid #b8dfe4; border-radius: 14px; background: rgba(255,255,255,.96); box-shadow: 0 3px 12px rgba(0,61,72,.22); transform: translateX(-50%); }
.route-summary { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; color: #173d44; white-space: nowrap; }
.route-summary strong { font-size: 13px; }
.route-summary span { overflow: hidden; color: #087f8c; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.route-actions { display: flex; gap: 5px; }
.route-actions button { min-width: 54px; height: 34px; padding: 0 9px; border-radius: 8px; font-size: 12px; font-weight: 800; white-space: nowrap; }
.route-clear-btn { border: 1px solid #bfdde1; background: white; color: #607b80; }
.route-map-btn { border: 1px solid #087f8c; background: white; color: #087f8c; }
.route-show-btn { border: 1px solid #087f8c; background: #087f8c; color: white; }
.route-gpx-btn { border: 1px solid #ef3f43; background: #ef3f43; color: white; }
.route-actions button:disabled { border-color: #b8c9cc; background: #b8c9cc; color: white; cursor: not-allowed; }
@media (max-width: 430px) {
  .route-panel { gap: 6px; padding-left: 11px; }
  .route-actions { gap: 4px; }
  .route-actions button { min-width: 48px; padding: 0 7px; font-size: 11px; }
  .manual-route-actions button { min-width: 42px; padding: 0 5px; }
  .gpx-open-btn { top: max(58px, calc(env(safe-area-inset-top) + 46px)); left: 12px; }
  .gpx-result-actions button { min-width: 44px; padding: 0 5px; }
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
