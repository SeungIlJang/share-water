import { Capacitor } from '@capacitor/core'
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob'

const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'
const PRODUCTION_BANNER_ID = 'ca-app-pub-9017259597860535/9371049904'
const RESERVED_BANNER_HEIGHT = 60
const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const liveAdsEnabled = import.meta.env.VITE_ADMOB_LIVE !== 'false'
const testAdsEnabled = import.meta.env.DEV || import.meta.env.VITE_ADMOB_TEST === 'true'
const configuredBannerId = import.meta.env.VITE_ADMOB_BANNER_ID || PRODUCTION_BANNER_ID
const bannerId = liveAdsEnabled ? configuredBannerId : TEST_BANNER_ID
// ⚠️ 광고 전면 중단 (2026-11-03 ~ 2026-12-02 AdMob 계정 정지)
// 무효 트래픽으로 정지됐고, 기간 중 추가 위반이면 영구 정지라 광고 요청 자체를 끊어 둔다.
// 이 앱의 OTA 번들은 Cloudflare Pages(share-water-ota.pages.dev)에 있고 깃 푸시로는
// 배포되지 않는다. 코드를 고친 뒤 `npm run ota:deploy` 를 돌려야 실제 앱에 내려간다.
// 12/2 이후 되살릴 때도 ADS_BLACKOUT 를 false 로 바꾸고 같은 명령을 돌릴 것.
const ADS_BLACKOUT = true
const adsEnabled = !ADS_BLACKOUT && (testAdsEnabled || (liveAdsEnabled && Boolean(configuredBannerId)))

let initialized = false

// 제스처 바(홈 인디케이터) 높이. viewport-fit=cover 가 있어야 값이 잡힌다.
const readBottomInset = () => {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);' +
    'visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const inset = Math.round(probe.getBoundingClientRect().height)
  probe.remove()
  return inset
}

let bottomInset = 0

const setBannerSpace = (height = 0) => {
  const total = height > 0 ? height + bottomInset : 0
  document.documentElement.style.setProperty('--admob-banner-height', `${Math.max(0, total)}px`)
}

export const initializeAdMob = async () => {
  if (!isAndroidApp) return

  // 광고가 늦게 로드되거나 아직 운영 ID가 없어도 하단 UI가 광고 영역과 겹치지 않게 한다.
  bottomInset = readBottomInset()
  setBannerSpace(RESERVED_BANNER_HEIGHT)
  if (initialized || !adsEnabled) return

  try {
    await AdMob.initialize({
      initializeForTesting: testAdsEnabled,
      maxAdContentRating: MaxAdContentRating.General,
    })

    // 동의 메시지가 설정되지 않은 계정에서는 requestConsentInfo()가 예외를 던진다.
    // 동의 조회 실패가 배너 노출 자체를 막지 않도록 분리해서 처리한다.
    let consentInfo = null
    try {
      consentInfo = await AdMob.requestConsentInfo()
      if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
        consentInfo = await AdMob.showConsentForm()
      }
    } catch (error) {
      console.warn('[admob] 동의 정보 조회 실패, 배너 요청은 계속합니다:', error)
    }

    if (consentInfo && consentInfo.status === AdmobConsentStatus.REQUIRED) return

    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => setBannerSpace(height))
    await AdMob.addListener(
      BannerAdPluginEvents.FailedToLoad,
      () => setBannerSpace(RESERVED_BANNER_HEIGHT),
    )
    await AdMob.showBanner({
      adId: bannerId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: bottomInset,
      isTesting: testAdsEnabled,
    })
    initialized = true
  } catch {
    setBannerSpace(RESERVED_BANNER_HEIGHT)
  }
}
