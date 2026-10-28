# iOS App Store release — 2026-10-27

## Release boundaries

- App: 모두의 음수대, bundle ID `com.sharewater.app`, version `1.0` / build `1`.
- Work only in `development/native-map-20261022`. Do not merge/push main or replace the production Android/web OTA.
- Apple Developer Program membership was verified active on the developer website today. This does not establish App Store Connect or Xcode upload authentication.
- App Store Connect and Xcode authentication are now verified. Do not ask the owner to repeat sign-in unless fresh evidence shows expiration; never save a password or OTP here. Earlier failed-export notes below describe the initial state.
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

## Evening account handoff

- App Store Connect browser login is now verified; do not ask the owner to repeat it.
- Created the iOS app record **모두의 음수대**, primary language Korean, bundle `com.sharewater.app`, internal SKU `share-water-ios`. Apple app ID: `6827522083`; record: https://appstoreconnect.apple.com/apps/6827522083/distribution . This does not upload a build or publish the app.
- Xcode initially had zero accounts; the owner then added the paid-membership account. Account count became one, and the separate browser/Xcode authentication gates are now resolved. Do not ask the owner to repeat those logins without new evidence.

## Successful upload and device launch

- App Store IPA export succeeded after Xcode sign-in. Deep signature, application identifier, `get-task-allow=false`, no device allowlist, non-enterprise profile and current expiry checks all passed. Local IPA: `release/share-water-ios-appstore-20261027/export/App.ipa`, 5,437,086 bytes, SHA-256 `f75bf2cf85eb2ddf1a32019f157c65f3e0fe48b3754db1c69855f087eb8cc440`.
- Upload succeeded using `xcodebuild -exportArchive` with an export-options copy setting `method=app-store-connect`, `destination=upload`, the verified Team and automatic signing. No app-specific password or new API key was requested. The local-export hash above is not asserted to equal Xcode's re-exported upload package.
- App Store Connect independently confirmed version **1.0 / build 1**, then processing completion (`제출 준비 완료` in the TestFlight build list), Apple build ID `b09809af-12bd-4fac-a885-81e2c48327a7`. **This is build-processing status, not App Review approval, review submission or public release.** No testers were invited and no automatic distribution group was created.
- Upload warnings: the current iOS 13.4 deployment target will need to be raised to at least 15.0 for the announced April 2027 requirement; vendor NMapsMap/NMapsGeometry matching dSYMs were absent. Upload still succeeded. Do not fabricate symbol files or claim that warnings were resolved.
- Also exported the same archive with `method=debugging` and automatic signing for the connected iPhone. Device profile expires 2027-10-26 21:48:37 UTC. Verified device inclusion and signature, installed as an update without uninstalling, launched successfully, and confirmed the own app process remained running. The old security launch error did not occur on this launch.
- Requested owner confirmation on the real iPhone: collapse panel, rotate, long press, cancel registration (do not save a public test point). Physical UI acceptance is **pending**; process survival does not establish rendered-map or touch correctness.
- Review gates above still apply: clean modal-input regression, final store metadata/screenshots/privacy/support/age-rating and public-submission handling. Do not submit for review or release merely because the build list says ready to submit.

## Build 2 — review preparation continuation

- Version1.0/build2 archive created and deep signature verified: `ShareWater-1.0-2.xcarchive`. **Not uploaded yet.** App Store export now fails with `No Accounts` and missing iOS Distribution identity; account count was freshly rechecked as0. Previous successful build1 upload remains intact. Do not confuse the cached development identity/profiles with current cloud distribution authentication. Asked the owner to check Xcode Apple Accounts; ASC browser remains authenticated.
- Replaced only the iOS long-press registration form with a standard UIKit alert containing name/memo and explicit public-submission consent. Native cancel resolves without a server write. Android retains the HTML form. The prior WebView-hit-test/scroll-setting experiments were reverted, not claimed as fixes.
- Clean simulator rotation → panel → long press → native cancel and search → selection → route passed2/2 (`/tmp/share-water-store-native-form-final-oct27.xcresult`). New iPad tests exposed an offscreen information card after keyboard transitions. Clamping its anchor to the visible map fixed iPad search → selection → route (`/tmp/share-water-store-ipad-popup-oct27.xcresult`,21.008s). iPad native cancel separately passed18.813s after configuring simulator location denial. Earlier fresh-iPad runs were blocked by a system permission dialog, not accepted as app success.
- Node45/45 passed. Mocked mobile-browser report → contributor block → reload retained block → restore passed without public test writes. Additive moderation schema/Worker deployed; health, list response and unauthenticated report rejection checked. Existing points/deletion ownership retained; backup SQL mode0600 in ignored release package. See `community-worker/MODERATION.md` for actual operator duties and rollback (no fabricated response SLA).
- New iOS features: public-submission consent, server content filtering, report reason enum/rate limit/deduplication, local contributor hiding/restoration. Anonymous public contributor ID is a separate hash, not the private deletion token/hash. Privacy manifest discloses public submitted location/content and anonymous ID, app functionality, linked to that app identity, no tracking.
- Existing Google Play listing for the same app publicly lists the support email. Reused that verified public contact for the support site and Store email field; no email sent. Published privacy/support pages through `SeungIlJang/privacy` commit `d178723`; GitHub Pages deployment succeeded and live content was verified. URLs: `https://seungiljang.github.io/privacy/share-water.html`, `https://seungiljang.github.io/privacy/share-water-support.html`.
- Store description/keywords/copyright/review notes entered; version form cannot be saved until required review phone is supplied. Contact email/support URL set from verified public support information. App subtitle/categories (Navigation/Travel), age questionnaire (UGC=yes, no social feed/chat/ads, calculated4+) and licensed third-party content rights configured. Screenshots uploaded separately: iPhone3, iPad2 (confirm final asset counts). No review submission or release.
- A signed real-device XCTest attempt was blocked before execution because the new UITest Runner provisioning profile needs current Xcode authentication. Build2 itself uses the already-current paid-Team development profile; verified connected-device inclusion, installed archive product as an update without uninstalling, launched successfully and own process remained running. This does not establish real-device gesture/cancel acceptance.
- Remaining: restore Xcode distribution authentication and export/upload build2, finish privacy labels/pricing and final Store validation, obtain review phone, and physical UI acceptance. Do not submit the older build1 in place of the fixes without an explicit product decision.
- Follow-up physical proof: used the maintained `pymobiledevice3` DVT screenshot service through its no-root userspace device tunnel, without changing Mac Accessibility permissions or issuing a new certificate. Screenshot of the foreground build2 app shows the actual Naver tiles, water markers, location indicator, list and controls rendered on the connected iPhone. Stored only in the ignored private proof folder; not uploaded as Store marketing because it includes real current location. Rotation/cancel physical input remains unverified. Temporary screenshot command completed; no public data mutation.
- Confirmed uploaded screenshot asset counts: iPhone3 and iPad2. The two iPad screenshots are actual iPad13-inch captures (2064×2752), not resized phone images.
- Final clean iPhone-simulator acceptance after popup/footer changes passed2/2 (`/tmp/share-water-store-build2-final-acceptance-oct27.xcresult`). Includes actual UIKit name entry, public-save disabled when empty/enabled after a name, and cancel without submitting. iPad search/route test passed separately. Node45/45 passed. Actual physical screenshot confirms rendering, not rotation/cancel input.
- ASC privacy: configured all3 types for app functionality, linked to anonymous app identity, not tracking. iOS vendor manifests declare no tracking/collected data; third-party advertising/updater are excluded. The exact entry “No data collected” was not used. Store privacy publishing/pricing state must be read back before claiming completion. Draft version form fields are backed up privately as `store-metadata-draft.json` because mandatory review-phone validation still prevents saving that form.


## October28 continuation — final input hardening and actual blockers

- Escaped JSON string arguments for information-card inline handlers so apostrophes/handler-like submitted text remains inert. Existing Node45/45 and actual mocked-browser adversarial-title regression passed; no public point was written. The server also rejects markup delimiters in new submissions. Worker deployment succeeded with version `ed9de20d-0c27-44bb-83d6-f28f0ebd3ea3`; health returned ok. Existing points and ownership are unchanged.
- Rebuilt the native iOS Store assets, synced only iOS, and regenerated `ShareWater-1.0-2.xcarchive` including the final hardening. Archive succeeded and deep strict code signature verification passed. Preserved the previous archive as `ShareWater-1.0-2-before-input-hardening.xcarchive`. This final archive is not installed on the phone yet; physical rendering proof described above was from the earlier build2 candidate.
- Fresh distribution export failed with `No Accounts` / missing iOS Distribution identity. Fresh Xcode account count remains0. Do not upload the previous build1 instead, revoke certificates, or delete the device app. Owner authentication is required before export/upload can resume.
- ASC session expired overnight. An attempted redirect caused repeated beforeunload dialogs on pricing; after preserving the existing metadata backup and leaving the pricing draft, the browser visibly reached the Apple login page. Xcode and browser logins are separate user-owned prerequisites. Keep version-tab drafts/backup intact.
- Privacy labels had been published for all3 declared types (app functionality, linked to anonymous app identity, no tracking), and screenshot counts were read back as iPhone3/iPad2. Pricing (intended Korea/free), availability and Mac/Vision opt-out are NOT confirmed saved; redo/read back after login. Review phone remains missing and blocks version-form save. No App Review submission or public release.
- Remaining resume sequence: owner logs in to Xcode and ASC and supplies review phone; verify/export the current build2 archive, physical gesture acceptance, upload/process/select build2, restore/save backed-up version metadata as needed, set/read back Korea/free availability and Mac/Vision exclusions, then validate and submit review. No main/OTA/Android release changes.


## October28 evening — saved Store metadata and availability

- ASC browser login is valid again; app record remains1.0 Preparing for Submission. Do not request another web login without new evidence. Xcode account count freshly checked0, so the final build2 distribution export/upload is still blocked independently.
- Restored saved metadata and supplied review contact from the private draft. Browser-script setters populated some DOM values but the conditional review subtree did not persist them. Re-entered first/last name, phone, email and notes using native browser type actions, saved, navigated away/back and verified nonempty persisted values (phone13chars, notes1222chars) and login-required=false. No contact phone is published in source/docs or support pages.
- Saved price base region Korea/KRW and zero price. After navigation/reload the current-price view explicitly reads `대한민국(KRW) ₩0.00`. Price schedules cover175territories, but actual availability is separately limited to Korea only:1available/174unavailable, Korea available after release, no pre-order and future territories auto-availability off.
- Saved and re-read AppleSiliconMac=false and VisionPro=false. PublicAppStore distribution remains selected. No paid price or new service spend.
- Privacy page readback says published1dayago, exactLocation/otherUserContent/userID, appFunctionality and linked-to-user, prior no-tracking configuration retained. PrivacyURL matches published policy.
- No review submission/public release and no build2 upload yet. Resume only after Xcode account restoration: distribution export/IPA verification, physical gesture acceptance, upload/process/select finalbuild2 and final review validation. Version review contact is now saved, no longer an outstanding user prerequisite.


## October28 final — uploaded, real-device acceptance and submitted

- Owner completed Xcode sign-in: local runtime and disk account counts1. Same-user/pinned-Xcode checks passed. Store export succeeded for final1.0(2), IPA5,448,075bytes, SHA256 `11243055d0d3b097b8740845f91986361f4f99365d9dc3c5410f5a4da60f8ad8`; deep signature, appID, non-debug Store profile/current expiry/no device allowlist verified.
- Upload succeeded21:54; ASC independently processed build2 and marked Ready to Submit. BuildID `a78492f4-df53-4c2b-9b7e-58fdba1cabff`. Existing future minimum-iOS warning and Naver vendor dSYM warnings remain accepted warnings, not resolved.
- Actual connected iPhone tests2/2 passed: rotation/panel/GPX/native-registration cancel30.194s, search/selection/route16.664s; result `/tmp/share-water-ios-device-qa-oct28.xcresult`. No fictional public point saved. After tests, verified final archive device profile, updated phone without uninstall, launched and confirmed its own process still running. Physical-input acceptance gate is now satisfied, unlike earlier screenshot-only evidence.
- Selected build2 and saved. First Add to Review validation rejected the prior screenshot state despite visible3/2asset counts. Removed/reuploaded only this release's3iPhone screenshot assignments from retained originals and acknowledged scaling; kept iPad2 and asset-library originals. The server then accepted Add to Review. Do not treat visible asset counts alone as proof of finalized uploads.
- Clicked final Submit for Review on the explicit1.0(2) submission draft. ASC showed **1.0 Waiting for Review / 심사 대기 중**, zero drafts and one item submitted. Release remains Korea-only/free/automatic after approval. **Submitted, not approved or publicly released yet.**

### Account recognition investigation and guard

- Earlier NoAccounts failures were genuine and coincided with0saved accounts; current disk/runtime both1 and actual export/upload/phone provisioning succeeded. Browser auth is separate. Checked same macOS user, no HOME override, correct preferences ownership0600, one running intended Xcode, login keychain no-timeout, and known project/workspace/launch settings for destructive account resets. No reset writer or removal cause found in inspected scope.2hour retained account logs did not establish deletion/auth-expiry events;2day log scan timed out35s. Do not claim a proven root cause or permanent Apple-session repair.
- Added read-only `npm run ios:store:preflight` and pinned full-Xcode wrapper `npm run ios:store:xcodebuild -- <args>`. Checks actual macOS home/user, disk vs preference-cache account agreement and account presence before running the verified Xcode binary. It never imports/deletes preferences or resets/copies credentials/Keychain. On cache disagreement inspect/reopen Xcode first rather than immediately asking sign-in. Future export/upload must still verify cloud authentication; account count alone is not proof.
- Wrapper check/current Xcode version and rejected invalid-argument path verified. This guards execution context and diagnoses recurrence; **it does not guarantee credentials never expire or restore a deleted account**. Do not set plist immutable or overwrite authentication stores to simulate persistence. Global xcode-select remains unchanged.

### Follow-up: locked-screen credential access failure identified

During the separate toilet candidate provisioning at 22:29:02, Xcode logged missing `Xcode-Username`, securityd simultaneously logged locked-Keychain `-25308` failures, and saved account count fell to zero. The console session was subsequently observed locked. This is stronger evidence than the earlier inconclusive investigation: the data-protection Keychain used for account credentials can be inaccessible while the ordinary login Keychain remains unlocked. See the matching public report https://github.com/idvorkin/bug-kit/issues/53 (different Xcode version; local correlated logs are the primary evidence).

The preflight now checks current console lock state before provisioning. Its wrapper temporarily holds display/idle-sleep assertions, monitors re-lock and stops only its owned build process, then releases its assertion. Ten guard tests pass, including fail-closed unknown state and cleanup paths. A live unlocked check reports zero accounts correctly; no deliberate live lock-during-signing test was run. Owner must re-add an already discarded account once while unlocked. Use the wrapper for future provisioning; no automatic authentication retry, permanent lock-policy change, Keychain reset or token restoration is performed. This mitigates this failure path, not independent Apple server expiration or signing launched outside the wrapper. No new water binary/submission is needed for this tooling-only change.

### Account UI versus command-line discrepancy

Owner supplied a current Apple Accounts screenshot showing a registered Apple account and Admin team. Both legacy preference arrays still read zero, but that alone does not prove UI logout. Updated the preflight to treat zero legacy entries as diagnostic, not a hard failure. An unlocked, guarded distribution-export attempt still returned No Accounts (exit70), without a missing-Xcode-Username warning. Account presence in the UI is confirmed; command-line provisioning is not working yet. Preserve the account and inspect a normal Xcode refresh/relaunch before requesting another sign-in. Do not conflate this observation with the earlier correlated screen-lock failure.
