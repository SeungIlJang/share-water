<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { NativeMap, nativeMapAvailable, measureNativeMap, observeNativeMapBounds } from '@/services/nativeMap.js';

const surface = ref(null);
const ready = ref(false);
const rendered = ref(false);
const error = ref('');
const authCode = ref('');
const camera = ref({ bearing: 0, zoom: 15 });
const collapsed = ref(false);
const picked = ref(null);
const clicked = ref('');
const routeVisible = ref(false);
const controlClicks = ref(0);
const markers = [
  { id: 'stadium', title: '회전 검증 · 운동장', latitude: 37.512, longitude: 127.074, order: 1 },
  { id: 'north', title: '회전 검증 · 북쪽', latitude: 37.515, longitude: 127.074, order: 2 },
  { id: 'east', title: '회전 검증 · 동쪽', latitude: 37.512, longitude: 127.079, order: 3 },
];
const bearing = computed(() => Math.round(camera.value.bearing || 0));
let cleanupBounds;
let renderTimer;
const listeners = [];

async function turn(angle) { camera.value = await NativeMap.moveCamera({ bearing: angle }); }
async function toggleRoute() {
  routeVisible.value = !routeVisible.value;
  await NativeMap.setRoute({ points: routeVisible.value ? markers : [] });
}
async function rebuild() {
  ready.value = false;
  await NativeMap.destroy();
  await create();
}
async function openWebFallback() {
  cleanupBounds?.();
  clearInterval(renderTimer);
  await NativeMap.destroy();
  location.search = '?nativeMap=web';
}
async function create() {
  try {
    clearInterval(renderTimer);
    rendered.value = false;
    error.value = '';
    const clientId = import.meta.env.VITE_NAVER_NATIVE_CLIENT_ID?.trim();
    if (!clientId) throw new Error('새 share-water Application의 Client ID 설정이 필요합니다.');
    await nextTick();
    camera.value = await NativeMap.create({ clientId,
      ...measureNativeMap(surface.value), center: markers[0], zoom: 15, bearing: 0 });
    await NativeMap.setMarkers({ markers });
    await NativeMap.setUserLocation({ position: { latitude: 37.511, longitude: 127.073 } });
    ready.value = true;
    renderTimer = setInterval(async () => {
      try {
        const state = await NativeMap.getState();
        if (state.loaded && state.fullyRendered) {
          rendered.value = true;
          clearInterval(renderTimer);
        }
      } catch { clearInterval(renderTimer); }
    }, 250);
  } catch (failure) { error.value = failure.message; }
}
onMounted(async () => {
  if (!nativeMapAvailable()) { error.value = '네이티브 검증 빌드에서 열어 주세요. 웹 지도는 변경되지 않았습니다.'; return; }
  document.documentElement.classList.add('native-map-active');
  for (const [name, handler] of Object.entries({
    cameraMove: (event) => { camera.value = event; },
    cameraIdle: (event) => { camera.value = event; },
    mapLongPress: (event) => { picked.value = event; },
    markerTap: (event) => { clicked.value = event.id; },
    authError: (event) => { authCode.value = event.code; error.value = event.message; },
  })) listeners.push(await NativeMap.addListener(name, handler));
  await create();
  cleanupBounds = observeNativeMapBounds(surface.value, (failure) => { error.value = failure.message; });
  window.__nativeMapProof = { getState: () => NativeMap.getState(), turn, rebuild };
});
onUnmounted(() => {
  clearInterval(renderTimer);
  cleanupBounds?.();
  for (const listener of listeners) void listener.remove();
  if (nativeMapAvailable()) void NativeMap.destroy();
  document.documentElement.classList.remove('native-map-active');
  delete window.__nativeMapProof;
});
</script>

<template>
  <main class="proof-app">
    <section ref="surface" class="proof-map">
      <div class="proof-gesture-target" role="img" aria-label="지도 제스처 검증 영역"></div>
      <header class="proof-status" data-native-map-ui>
        <strong>네이티브 지도 · 개발 검증</strong>
        <span>운영 미반영 · {{ ready ? '지도 준비됨' : '지도 준비 중' }} · {{ bearing }}°</span>
        <small v-if="rendered">지도 렌더링 확인됨</small>
        <small v-if="clicked">선택: {{ clicked }}</small>
        <small v-if="error" class="proof-error">{{ error }} {{ authCode }}</small>
      </header>
      <button class="proof-compass" data-native-map-ui :disabled="!ready" @click="turn(0)">북쪽</button>
      <div v-if="picked" class="proof-picked" data-native-map-ui>
        <strong>길게 누른 실제 좌표</strong>
        <span>{{ picked.latitude.toFixed(6) }}, {{ picked.longitude.toFixed(6) }}</span>
        <button @click="picked = null">닫기</button>
      </div>
    </section>
    <section class="proof-controls" :class="{ collapsed }" data-native-map-ui>
      <button class="proof-handle" @click="collapsed = !collapsed">{{ collapsed ? '패널 복원 ↑' : '패널 접기 ↓' }}</button>
      <template v-if="!collapsed">
        <p>두 손가락으로 회전·확대 / 지도 길게 누르기</p>
        <div class="proof-row">
          <button v-for="angle in [0, 45, 90, 180]" :key="angle" :disabled="!ready" @click="turn(angle)">{{ angle }}°</button>
        </div>
        <div class="proof-row">
          <button :disabled="!ready" @click="toggleRoute">{{ routeVisible ? '경로 숨기기' : '경로 표시' }}</button>
          <button @click="controlClicks++">웹 버튼 {{ controlClicks }}</button>
          <button :disabled="!ready" @click="rebuild">지도 재생성</button>
        </div>
        <a href="/?nativeMap=web" @click.prevent="openWebFallback">기존 웹 지도 열기</a>
      </template>
    </section>
    <footer class="proof-ad-space">광고·하단 안전 영역 검증 공간</footer>
  </main>
</template>

<style>
html.native-map-active, html.native-map-active body, html.native-map-active #app { background: transparent !important; }
.proof-app { position: fixed; inset: 0; display: flex; flex-direction: column; background: transparent; color: #16333d; }
.proof-map { position: relative; flex: 1; min-height: 180px; background: transparent; }
.proof-gesture-target { position: absolute; top: 160px; bottom: 95px; left: 24px; right: 100px; }
.proof-status { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; right: 12px; padding: 10px; display: flex; flex-direction: column; gap: 4px; border-radius: 12px; background: #fffffff0; box-shadow: 0 2px 8px #0002; font-size: 13px; }
.proof-compass { position: absolute; right: 16px; bottom: 16px; }
.proof-picked { position: absolute; left: 12px; right: 12px; bottom: 16px; display: flex; flex-direction: column; padding: 12px; gap: 6px; border-radius: 12px; background: white; }
.proof-controls { flex: 0 0 auto; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 8px; background: #eef8fb; border-top: 1px solid #b7dce2; }
.proof-controls p { margin: 0; font-size: 12px; }
.proof-row { display: flex; gap: 8px; }
.proof-row button { flex: 1; }
.proof-app button { min-height: 38px; border: 1px solid #087f8c; background: white; border-radius: 9px; color: #087f8c; padding: 7px 10px; font-weight: 700; }
.proof-handle { width: 100%; touch-action: none; }
.proof-ad-space { min-height: 64px; padding-bottom: env(safe-area-inset-bottom); background: white; text-align: center; font-size: 12px; color: #607b80; }
.proof-error { color: #b33a30; }
</style>
