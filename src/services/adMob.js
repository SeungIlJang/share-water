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
const adsEnabled = testAdsEnabled || (liveAdsEnabled && Boolean(configuredBannerId))

let initialized = false

const setBannerSpace = (height = 0) => {
  document.documentElement.style.setProperty('--admob-banner-height', `${Math.max(0, height)}px`)
}

export const initializeAdMob = async () => {
  if (!isAndroidApp) return

  // 광고가 늦게 로드되거나 아직 운영 ID가 없어도 하단 UI가 광고 영역과 겹치지 않게 한다.
  setBannerSpace(RESERVED_BANNER_HEIGHT)
  if (initialized || !adsEnabled) return

  try {
    await AdMob.initialize({
      initializeForTesting: testAdsEnabled,
      maxAdContentRating: MaxAdContentRating.General,
    })

    let consentInfo = await AdMob.requestConsentInfo()
    if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
      consentInfo = await AdMob.showConsentForm()
    }

    if (consentInfo.status === AdmobConsentStatus.REQUIRED) return

    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => setBannerSpace(height))
    await AdMob.addListener(
      BannerAdPluginEvents.FailedToLoad,
      () => setBannerSpace(RESERVED_BANNER_HEIGHT),
    )
    await AdMob.showBanner({
      adId: bannerId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: testAdsEnabled,
    })
    initialized = true
  } catch {
    setBannerSpace(RESERVED_BANNER_HEIGHT)
  }
}
