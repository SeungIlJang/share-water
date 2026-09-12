// 음수대 데이터 로딩 (원격 최신본 우선 + 로컬 번들 폴백)
//
// - 로컬 번들: public/data.json (앱에 항상 포함, 오프라인 대비)
// - 원격 최신: VITE_DATA_URL (호스팅된 data.json) — 앱 재배포 없이 갱신 가능
// - data-version.json 의 v(버전)를 비교해, 원격이 더 최신일 때만 대용량 파일을 내려받음
//   → 매 실행마다 15MB 를 받지 않음. 원격/네트워크 실패 시 로컬로 안전하게 폴백.

const BASE = import.meta.env.BASE_URL;
const LOCAL_DATA = `${BASE}data.json`;
const LOCAL_VER = `${BASE}data-version.json`;
const REMOTE_DATA = import.meta.env.VITE_DATA_URL || '';
const REMOTE_VER = REMOTE_DATA.replace(/data\.json(\?.*)?$/, 'data-version.json');

// timeout(ms) 안에 응답 없으면 중단 → 느린 원격이 앱 시작을 막지 않도록
const fetchJson = async (url, timeout = 0) => {
  const ctrl = new AbortController();
  const timer = timeout ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
    return await r.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const ver = (o) => (o && Number(o.v)) || 0;

const VER_TIMEOUT = 2500;   // 원격 버전 확인: 느리면 2.5초 후 로컬로
const DATA_TIMEOUT = 15000; // 원격 데이터 다운로드: 최대 15초

async function loadDrinkingWater() {
  // 1) 원격이 로컬보다 최신이면 원격 사용 (원격이 느리면 타임아웃 → 로컬)
  if (REMOTE_DATA && REMOTE_VER !== REMOTE_DATA) {
    try {
      const [localVer, remoteVer] = await Promise.all([
        fetchJson(LOCAL_VER).catch(() => ({ v: 0 })),
        fetchJson(REMOTE_VER, VER_TIMEOUT),
      ]);
      if (ver(remoteVer) > ver(localVer)) {
        console.info(`[data] 원격 최신본 사용 (v${ver(remoteVer)} > v${ver(localVer)})`);
        return await fetchJson(REMOTE_DATA, DATA_TIMEOUT);
      }
      console.info('[data] 로컬 번들이 최신 → 로컬 사용');
    } catch (e) {
      console.warn('[data] 원격 확인 실패/지연 → 로컬 번들 사용:', e?.message);
    }
  }
  // 2) 로컬 번들
  try {
    return await fetchJson(LOCAL_DATA);
  } catch (e) {
    console.error('[data] 로컬 데이터 로드 실패:', e?.message);
    return [];
  }
}

export const drinkingWaterData = loadDrinkingWater();
