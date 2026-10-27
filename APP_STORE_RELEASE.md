# iOS App Store release — 2026-10-27

## Release boundaries

- App: 모두의 음수대, bundle ID `com.sharewater.app`, version `1.0` / build `1`.
- Work only in `development/native-map-20261022`. Do not merge/push main or replace the production Android/web OTA.
- Apple Developer Program membership was verified active on the developer website today. This does not establish App Store Connect or Xcode upload authentication.
- App Store Connect currently displays a separate login screen in the managed Chrome tab. The owner must complete authentication there; never save a password or OTP here.
- Native-map iOS assets use the native renderer, no proof screen, no OTA updates and no iOS banner requests. A store upload is not review submission or public release.
- Capacitor's supported iOS `includePlugins` configuration excludes the unused AdMob and OTA SDKs from the iOS binary only. Android dependencies remain unchanged. iOS no longer requires a sample advertising App ID at startup.
- Required-reason manifest declares file timestamps for GPX/files inside the app container. Public-submission content is declared for app functionality, not tracking.
- `node scripts/build-ios-icon.mjs` renders the existing SVG brand assets into opaque iOS icon/splash images. No default Capacitor icon is shipped.

## Store listing draft (Korean)

Name: 모두의 음수대

Subtitle: 가까운 음수대 찾기와 산책 코스

Promotional text: 가까운 음수대를 지도와 거리순 목록에서 찾아보세요. 지역 검색과 도보 길찾기, GPX 산책 코스 만들기를 지원합니다.

Description:

모두의 음수대는 서울·경기·인천의 음수대와 식수 가능 지점을 찾아주는 지도 앱입니다.

- 현재 위치 또는 지도 중심 주변 음수대 찾기
- 공원·도시·구·동·주소 검색과 거리순 목록
- 두 손가락 지도 회전과 확대·축소
- 음수대 선택, 도보 경로 확인 및 네이버 지도 길찾기 연결
- 음수대를 지나는 GPX 왕복 산책 코스 만들기 및 공유
- 지도 길게 누르기로 음수대 위치 제보

위치 권한은 선택 사항이며 거부해도 지도 탐색과 지역 검색을 이용할 수 있습니다.
음수대 제보를 등록하면 위치·이름·메모가 다른 사용자에게 공개됩니다. 자신의 제보 삭제 권한은 등록한 기기에 저장됩니다.

음수대 정보는 공공데이터, 지자체 자료와 OpenStreetMap에 기반하며 현장 상황과 다를 수 있습니다. 공원 단위 자료는 개별 음수대가 아닌 대표 위치로 표시합니다. 방문 시 시설 안내와 식수 가능 여부를 확인하세요.

데이터 출처: 서울 열린데이터광장(서울아리수본부), 지자체 공식 자료, © OpenStreetMap contributors (ODbL).

Keywords: 음수대,식수,물,공원,산책,러닝,걷기,수돗물,GPX,수도권

Suggested primary category: Navigation. Secondary category: Health & Fitness.

## Review notes draft

- No login required. Location permission is optional; use regional search if unavailable.
- Search for 아시아공원, select an 음수대 and use 경로추가 to create a route.
- GPX opens the walking-course builder. GPX export uses the iOS share sheet.
- Long press opens a public submission form. Cancel leaves the public database unchanged.
- The water-point dataset is bundled for search; map tiles and walking-route calculation require the internet.
- Native-map behavior is provided by the Naver mobile SDK. The web fallback is available on map-authentication errors.

## Must be settled before review/public release

- Final App Store Connect app record, unique build/version and processing result.
- Valid distribution signing/export and Apple upload validation.
- iPhone screenshots from the actual release UI; iPad screenshots and layout checks if universal device family is retained.
- App Privacy answers based on native SDK network behavior and public submissions. Do not claim “Data Not Collected” merely because no account is required.
- Published privacy policy must describe public submissions, local deletion capability, native map provider and actual iOS advertising behavior.
- Support URL, review contact and age-rating answers; report/moderation handling for public submissions.
- Release behavior checks for search selection, route choice, gestures, permission denial, GPX sharing and registration cancel. Physical-device acceptance remains separate from simulator tests.

## Existing recovery checkpoint

Keep `rollback-before-native-map-20261022` and original production OTA `web-355b8d104e82a90b`. Never delete existing app data to resolve signing issues.

## Observed result (2026-10-27)

- Node tests: 42/42 passed. Android `compileDebugJavaWithJavac` passed; no new Android release was deployed.
- iOS search → selection → route choice passed repeatedly, including the clean final test (25.271 seconds).
- Rotation → collapsed panel → registration cancel passed with diagnostic instrumentation after routing web-owned touches through `WKWebView.scrollView.hitTest`. **The same flow still failed after removing diagnostics. Treat it as unresolved/intermittent, not accepted.** The diagnostic code has been removed; do not add it to release as a workaround.
- Signed Release archive succeeded: `release/share-water-ios-appstore-20261027/ShareWater-1.0-1.xcarchive`. Deep signature validation passed; app version 1.0 (1), iPhoneOS 26.2 SDK; privacy manifest present and AdMob/updater frameworks absent. This is a candidate, not review-ready.
- App Store export **failed**: `No Accounts`, missing iOS Distribution signing certificate, and missing App Store provisioning profile. Actual Xcode `DVTDeveloperAccountManagerAppleIDLists/IDE.Identifiers.Prod` contains **zero accounts** despite the developer web membership being active. The owner must sign into Xcode Settings → Accounts. Do not regenerate certificates, delete app data, or ask for passwords in chat as a shortcut.
- App Store Connect is still at its separate login screen. No app record, uploaded IPA, review submission or public release has been confirmed.
- Three actual iPhone screenshots (1206×2622, no alpha) are saved in the release package. Universal target still includes iPad, so iPad verification/screenshots remain a review gate.
- Local privacy-policy draft has been updated for public submissions and iOS SDK removal; the published policy URL has **not** been updated or verified to match it.

Resume after authentication: finish the clean modal-input regression gate, refresh the release archive if source behavior changes, export with `ios/ExportOptions-AppStore.plist`, verify the distribution-signed IPA, create/check the App Store Connect record and upload. Settle all review gates above before submitting for review or releasing.
