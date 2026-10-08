import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const MANIFEST_URL = import.meta.env.VITE_LIVE_UPDATE_MANIFEST_URL
  || 'https://share-water-ota.pages.dev/live-update/manifest.json';
const UPDATE_ORIGIN = new URL(MANIFEST_URL).origin;
const CHECK_TIMEOUT_MS = 7000;
const CHECK_COOLDOWN_MS = 30000;
const UPDATE_STATUS_EVENT = 'share-water:update-status';
let checkInProgress = false;
let lastCheckAt = 0;
let visibilityListenerRegistered = false;

const reportStatus = (status, message = '') => {
  window.dispatchEvent(new CustomEvent(UPDATE_STATUS_EVENT, {
    detail: { status, message },
  }));
};

const waitForStatusPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const fetchManifest = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const validateManifest = (manifest) => {
  if (!manifest || typeof manifest.version !== 'string') return false;
  if (!/^web-[a-f0-9]{16}$/.test(manifest.version)) return false;
  if (!/^[a-f0-9]{64}$/.test(manifest.checksum || '')) return false;

  try {
    const url = new URL(manifest.url);
    return url.origin === UPDATE_ORIGIN && url.pathname.startsWith('/live-update/');
  } catch {
    return false;
  }
};

export async function startLiveUpdate() {
  if (!Capacitor.isNativePlatform()) return;
  const now = Date.now();
  if (checkInProgress || now - lastCheckAt < CHECK_COOLDOWN_MS) return;
  checkInProgress = true;
  lastCheckAt = now;

  try {
    reportStatus('checking', '업데이트 확인 중...');

    // 새 번들이 여기까지 실행됐다면 정상으로 확정한다. 호출하지 않으면 자동 롤백된다.
    await CapacitorUpdater.notifyAppReady();

    const manifest = await fetchManifest();
    if (!validateManifest(manifest)) throw new Error('잘못된 업데이트 정보');

    const [{ bundle: current }, queued] = await Promise.all([
      CapacitorUpdater.current(),
      CapacitorUpdater.getNextBundle(),
    ]);

    if (current.version === manifest.version) {
      reportStatus('ready');
      return;
    }

    // 이미 받아 둔 번들이 있으면 앱 프로세스가 완전히 종료되기를 기다리지 않고
    // 즉시 다시 로드한다. Android에서 최근 앱으로 닫았다 여는 동작은 보통
    // cold start가 아니어서 next()로 예약한 번들이 계속 적용되지 않을 수 있다.
    if (queued?.version === manifest.version) {
      console.info(`[update] ${manifest.version} 적용`);
      reportStatus('applying', '업데이트 적용 중...');
      await waitForStatusPaint();
      await CapacitorUpdater.set({ id: queued.id });
      return;
    }

    reportStatus('downloading', '업데이트 다운로드 중...');
    const bundle = await CapacitorUpdater.download({
      version: manifest.version,
      url: manifest.url,
      checksum: manifest.checksum,
    });

    // 새 번들을 현재 버전으로 바꾸고 WebView를 즉시 다시 불러온다.
    console.info(`[update] ${manifest.version} 다운로드 완료, 즉시 적용`);
    reportStatus('applying', '업데이트 적용 중...');
    await waitForStatusPaint();
    await CapacitorUpdater.set({ id: bundle.id });
  } catch (error) {
    // 네트워크/서버 문제는 앱 사용을 막지 않는다. 현재 정상 번들을 그대로 유지한다.
    console.info('[update] 확인 생략:', error?.message || error);
    reportStatus('ready');
  } finally {
    checkInProgress = false;
  }
}

export function installLiveUpdateChecks() {
  if (!Capacitor.isNativePlatform()) return;
  startLiveUpdate();
  if (visibilityListenerRegistered) return;
  visibilityListenerRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startLiveUpdate();
  });
}
