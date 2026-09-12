<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from '@/utils/geolocation.js';

const props = defineProps({
  locations: { type: Array, required: true },
  selectedId: { type: [String, Number], default: null },
  center: { type: Object, default: null },
});

const emit = defineEmits(['region-changed', 'map-tap']);
const map = ref(null);
const markers = ref({});
const infoWindows = ref({});
const mapInitialized = ref(false);
const currentLocationMarker = ref(null);
const userPosition = ref(null);
const openInfoId = ref(null);
let mapDomElement;
let mapDomClickHandler;
let apiTimer;

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

const routeWebUrl = (lat, lng, name) => (
  `https://map.naver.com/p/directions/-/${lng},${lat},${encodeURIComponent(name)},,PLACE_POI/-/walk`
);

const buildInfoContent = (location) => {
  const details = [
    location.detailLocation ? `💧 ${esc(location.detailLocation)}` : '',
    location.office ? `관리: ${esc(location.office)}` : '',
  ].filter(Boolean).map((item) => `<p>${item}</p>`).join('');
  const distance = location.distance != null
    ? `<p class="info-distance">${formatDistance(location.distance)} · ${formatWalkTime(location.distance)}</p>`
    : '';
  const address = fullAddress(location);

  return `
    <div class="info-window">
      <h3>${esc(location.title)}</h3>
      <p>${esc(address)}</p>
      ${details ? `<div class="info-rich">${details}</div>` : ''}
      ${distance}
      <div class="info-actions">
        <button class="info-btn route" type="button" onclick='window.__swRoute(${location.latitude}, ${location.longitude}, ${JSON.stringify(location.title)})'>🧭 길찾기</button>
        <button class="info-btn copy" type="button" onclick='window.__swCopy(${JSON.stringify(address)})'>📋 주소복사</button>
      </div>
    </div>`;
};

const makeWaterIcon = (selected = false) => ({
  content: `<div class="water-marker${selected ? ' selected' : ''}" aria-label="음수대"><span>💧</span></div>`,
  anchor: new naver.maps.Point(21, 21),
});

const smoothMoveMap = (position, zoom = null) => {
  if (!map.value) return;
  map.value.panTo(position, { duration: 450, easing: 'easeOutCubic' });
  if (zoom !== null && map.value.getZoom() !== zoom) map.value.setZoom(zoom);
};

const updateSelectedStyles = (id) => {
  openInfoId.value = id;
  Object.entries(markers.value).forEach(([markerId, marker]) => {
    const selected = String(markerId) === String(id);
    marker.setIcon(makeWaterIcon(selected));
    marker.setZIndex(selected ? 300 : 100);
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
      icon: makeWaterIcon(String(location.id) === String(props.selectedId)),
      zIndex: 100,
    });
    const info = new naver.maps.InfoWindow({
      content: buildInfoContent(location),
      zIndex: 150,
      maxWidth: 280,
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

const registerHelpers = () => {
  window.__swRoute = async (lat, lng, name) => {
    const label = encodeURIComponent(name || '음수대');
    const appUrl = `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${label}&appname=com.sharewater.app`;
    const webUrl = routeWebUrl(lat, lng, name);
    if (!Capacitor.isNativePlatform()) {
      window.open(webUrl, '_blank');
      return;
    }
    const { AppLauncher } = await import('@capacitor/app-launcher');
    const packageName = 'com.nhn.android.nmap';
    try {
      const probe = Capacitor.getPlatform() === 'android' ? packageName : 'nmap://route';
      if ((await AppLauncher.canOpenUrl({ url: probe })).value) {
        await AppLauncher.openUrl({ url: appUrl });
      } else {
        await AppLauncher.openUrl({ url: webUrl });
      }
    } catch (error) {
      await AppLauncher.openUrl({ url: webUrl });
    }
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
  mapDomElement?.removeEventListener('click', mapDomClickHandler, true);
  delete window.__swRoute;
  delete window.__swCopy;
});
</script>

<template>
  <div id="map" class="map-view"></div>
  <button class="current-location-btn" type="button" title="현재 위치로 이동" @click="showCurrentLocation">
    <span></span>
  </button>
</template>

<style scoped>
.map-view { position: absolute; inset: 0; width: 100%; height: 100%; }
.current-location-btn { position: absolute; right: 18px; bottom: 18px; z-index: 800; width: 44px; height: 44px; border: 1px solid #c7dfe3; border-radius: 50%; background: white; box-shadow: 0 2px 7px rgba(0,0,0,.18); }
.current-location-btn span { display: block; width: 22px; height: 22px; margin: auto; border: 3px solid #0a93a2; border-radius: 50%; position: relative; }
.current-location-btn span::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: #0a93a2; }
:deep(.water-marker) { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 2px solid #0a93a2; border-radius: 50% 50% 50% 8px; background: white; box-shadow: 0 2px 7px rgba(0,61,72,.32); transform: rotate(-45deg); transition: transform .15s; cursor: pointer; }
:deep(.water-marker span) { font-size: 23px; line-height: 1; transform: rotate(45deg); }
:deep(.water-marker.selected) { border-width: 3px; background: #d8f6fa; box-shadow: 0 0 0 4px rgba(10,147,162,.28), 0 3px 9px rgba(0,61,72,.38); transform: rotate(-45deg) scale(1.25); }
:deep(.info-window) { min-width: 220px; padding: 14px; color: #24474e; }
:deep(.info-window h3) { margin: 0 0 7px; color: #173d44; font-size: 16px; }
:deep(.info-window p) { margin: 2px 0; color: #60777c; font-size: 13px; }
:deep(.info-window .info-rich) { margin-top: 7px; padding-top: 7px; border-top: 1px solid #dcecee; }
:deep(.info-window .info-distance) { margin-top: 7px; color: #087f8c; font-weight: 700; }
:deep(.info-actions) { display: flex; gap: 7px; margin-top: 11px; }
:deep(.info-btn) { flex: 1; height: 34px; border-radius: 7px; font-weight: 700; }
:deep(.info-btn.route) { border: 1px solid #087f8c; background: #087f8c; color: white; }
:deep(.info-btn.copy) { border: 1px solid #087f8c; background: white; color: #087f8c; }
:deep(.current-location-marker) { position: relative; width: 30px; height: 30px; }
:deep(.current-location-marker .pin) { position: absolute; top: 8px; left: 8px; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; background: #4285f4; }
:deep(.current-location-marker .pulse) { position: absolute; width: 30px; height: 30px; border-radius: 50%; background: rgba(66,133,244,.25); animation: pulse 2s infinite; }
@keyframes pulse { 0% { transform: scale(.5); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
</style>

<style>
.sw-toast { position: fixed; z-index: 3000; bottom: 90px; left: 50%; padding: 10px 17px; border-radius: 22px; background: rgba(0,0,0,.82); color: white; opacity: 0; transform: translate(-50%, 10px); transition: .25s; }
.sw-toast.show { opacity: 1; transform: translate(-50%, 0); }
</style>
