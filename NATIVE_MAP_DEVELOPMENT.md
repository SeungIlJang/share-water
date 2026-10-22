# Native map migration — isolated development

Branch: `development/native-map-20261022`. Worktree: `share-water-native-map`.
Do not merge to `main` or deploy an OTA until the acceptance gates below pass.
Main pushes trigger production OTA automation. This branch has not changed production.

## Recovery

See `ROLLBACK.md` and the retained `release/share-water-rollback-20261022` package in the original worktree.
Baseline source: `db84cc37a087a946304688972a3b1916e6336828`.
Retained production OTA: `web-355b8d104e82a90b` (not the earlier manual build).
Native migration requires a newly installed binary. Web OTA cannot remove native SDK changes.
Keep the web renderer available; do not change public community storage or device ownership tokens.

## Phase 1: renderer / bridge proof

- Capacitor remains 6.2.1. Provider SDKs: Android 3.24.0, iOS NMapsMap 3.24.0.
- Normal `npm run build` starts the existing app. `npm run build:native-proof` starts the isolated proof screen and disables OTA updates and live advertisements.
- Android: `npm run android:proof` creates a debug APK only. It is not a signed Play release.
- iOS: build proof assets, `npx cap sync ios`, then build `ios/App/App.xcworkspace` with Xcode. Use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; do not alter global xcode-select.
- iOS Podfile requires platform 13.4 for the existing updater dependency. NMapsMap pod is pinned in Podfile/Podfile.lock. The existing AdMob 6 plugin cannot compile against UMP 3.1 (renamed Swift symbols); pin GoogleUserMessagingPlatform 2.2.0 for this proof. Revisit the ad SDK/plugin upgrade together before App Store release.
- `/?nativeMap=web` opens the existing web app in a proof binary.
- iOS Info.plist uses Google's public **sample** AdMob application ID. The SDK validates it on process startup even when banners are disabled; an absent ID crashed the first simulator launch. A production iOS AdMob app ID, icons, signing and App Store metadata are not configured by this proof.
- Native map view is below the transparent WebView. DOM elements marked `data-native-map-ui` are excluded from native hit testing. CSS layout is converted to native view coordinates.
- Android routes full multi-pointer sequences from Activity to MapView. iOS uses UIKit hit testing, letting the OS retain touch ownership for each sequence.
- The map's camera rotates geographic geometry/routes. Screen-facing markers use non-flat mode and zero icon angle. Fixed Vue controls do not rotate. Provider basemap labels follow SDK behavior, not a promise of universally horizontal road labels.

### Common `WaterNativeMap` contract

Methods: `create({clientId,bounds,excludedRects,center,zoom,bearing})`, `setBounds`, `getState`, `moveCamera`, `fitBounds({points})`, `setMarkers({markers,selectedId})`, `setRoute({points})`, `setUserLocation({position})`, `destroy`.
Coordinates: `{latitude,longitude}`. Geometry: CSS pixels relative to WebView; `bounds.viewportWidth` is mandatory for scaling.
Events: `cameraMove`, `cameraIdle`, `markerTap`, `mapTap`, `mapLongPress`, `authError`.
Camera state: center latitude/longitude, zoom, bearing, tilt, markerCount; selected marker's projected CSS position when selected.
Never log API keys. The app receives only a safe auth message and error code.

## Acceptance gates (not all complete)

1. Authenticate and render real provider map tiles on both platforms. Android currently reports 401 with the existing web key; verify Mobile Dynamic Map access and package/bundle registration in the Naver Cloud console. Do not treat rendering markers over a blank grid as map acceptance.
2. Real two-pointer rotation and pinch; 0/45/90/180 degrees; inspect provider labels and marker orientation. Programmatic rotation alone is insufficient.
3. HTML controls and popups remain interactive, map long press uses the held coordinate, no unintended registration after pinch/drag/cancel.
4. Panel collapse/restore and advertisement safe-area simulation resize the native view and rendered tiles; no blank new area.
5. Background/resume, destroy/recreate, orientation/viewport changes, no duplicate listeners, no crash or stale native view.
6. Integrate official/shared markers, selection popups, search/filtering, current location, routes/GPX and registration with existing Vue app. Keep web fallback.
7. Physical Android and iPhone checks, release signing and production rollout only after acceptance. Simulator checks must be labeled as such.

## Verification record

- Initial Android debug APK compilation: passed.
- Android instrumentation APK compilation: passed.
- Existing Node suite: 41/41 passed.
- Normal web production build: passed, local artifact only, not deployed.
- Android runtime: native map engine and app markers appeared beneath Vue controls; SDK authentication 401 blocked basemap tiles.
- Android real-input instrumentation: passed 1 test covering two-pointer bearing change (>20°), actual HTML compass input, panel collapse/native height matching, and long-press delivery to Vue. Emulator only. Screenshots show 297° camera with upright markers and fixed UI. Basemap remains an unauthenticated grid, so no tile/label acceptance.
- iOS full simulator build: passed for arm64/x86_64 with Xcode (CODE_SIGNING_ALLOWED=NO). Initial UMP incompatibility and a stale LaunchScreen build-cache failure were resolved; native Swift bridge independent typecheck also passed.
- iOS 18.3 simulator runtime: app remained open and screenshot confirmed native markers/location beneath Vue header, buttons, bottom panel and simulated ad space. Initial SDK startup crash (missing iOS AdMob app ID) was fixed with the public sample ID. Mobile map authentication also returned 401. iOS actual touch gestures / physical iPhone remain unverified.
- Console preparation: Naver Cloud console opened as managed tab `water-map-console`; it redirects to `https://auth.ncloud.com/login`. User login is required before inspecting mobile service/package/bundle registration. Do not change paid service settings without checking existing authorization/costs.
