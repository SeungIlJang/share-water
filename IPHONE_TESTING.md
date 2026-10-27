# iPhone test preparation — 2026-10-24

Development worktree only; production and rollback checkpoint are unchanged.

## Current verified status — 2026-10-27 evening

Paid Team and both Xcode/Store logins are confirmed. App Store Connect version 1.0 (1) upload and Apple build processing succeeded, but no review/public release occurred. The same candidate was re-signed for development, installed as an update on the iPhone, launched and remained running. Owner confirmation of rendered map / rotated-map registration cancel is pending. Earlier authentication/launch blockers below are historical, not instructions to request login/trust again. See APP_STORE_RELEASE.md for current gates.

## Verified

- USB-connected physical iPhone 14 is paired with this Mac.
- Xcode 26.3 is installed; use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` per command.
- Added shared **App** scheme (app-only build/run/archive) because the workspace exposed only the UI-test scheme.
- `npm run build:native-integrated` and `npx cap copy ios` succeeded. Integrated test build disables OTA and live ads.
- Generic arm64 iPhone build passed with `CODE_SIGNING_ALLOWED=NO SDK_STAT_CACHE_ENABLE=NO`.
- Signed development product: `/tmp/share-water-iphone-device-build/Build/Products/Debug-iphoneos/App.app`.
- Bundle ID `com.sharewater.app`, display name 모두의 음수대. Installed successfully on the connected iPhone; not a Store release.

## Current user-owned prerequisites

- Pairing, Developer Mode, Xcode account and Personal Team selection are now verified. Preserve the user's Team settings.
- Signed device build succeeded; deep code-signature verification and profile inclusion of this device passed.
- Installation succeeded. Launch remains denied by iOS security pending explicit trust of the developer app profile: Settings → General → VPN & Device Management → Developer App → trust the user's Apple account. User was notified; do not reinstall or bypass trust.
- Development provisioning expires 2026-10-31 10:35 KST; this is temporary personal-device testing.
- Do not request passwords or verification codes in repository files. User completes account authentication in Xcode.

After profile trust is approved, retry device launch, verify the process stays alive, then inspect real map rendering/rotation/controls. No rebuild is required merely to trust this profile. Do not report physical-device acceptance before functional verification succeeds.

## Integration status

- Android integrated real-input test passed (39.638 seconds), actual rendered rotated-map screenshots retained locally.
- iOS simulator run 27: rotation/panel/GPX/registration-cancel integrated test passed (38.395 seconds); search → selection → route-button test still failed at popup visibility. Not all integration gates are complete.
- DEBUG-only hit-test/DOM diagnostics remain in the worktree and must be removed before a stable release. Physical testing must not modify public community records without explicit test cleanup.
- Never uninstall an existing app merely to solve signing; it may own deletion capabilities for public submissions.

## 2026-10-27 follow-up

- Paid developer web membership is now active, but Xcode's actual Apple account list is empty. App Store distribution export reports No Accounts / missing distribution certificate and profile. Re-authenticate in Xcode Settings → Accounts; App Store Connect browser authentication is a separate remaining gate.
- iOS dependencies now intentionally exclude unused AdMob/OTA SDKs; no sample GAD ID is required. iOS icon and launch screen use the existing water-brand SVGs; a privacy manifest is included.
- Search clearing itself during automatic map moves was fixed by reporting gesture camera changes separately. Clean iOS search/selection/route-choice passes.
- Collapsed/rotated-map registration cancel passed with diagnostics but failed again in the clean final run; not accepted. Temporary diagnostic code is removed. See APP_STORE_RELEASE.md for exact release result and resumption steps. No Store upload has completed.

## Evening outcome superseding the initial blockers

- Xcode account and App Store Connect browser authentication are now confirmed; App Store export/upload succeeded. Apple finished processing version 1.0 (1). No review submission/public release.
- Paid-Team development export was installed on the connected iPhone without uninstalling. Launch succeeded and the app process stayed alive. New provisioning expiry: 2027-10-26 21:48:37 UTC. No security error on this launch.
- Owner was asked to verify the actual map and the collapsed/rotated-map registration-cancel flow on the phone. Await that answer; do not mark physical functional checks passed based only on the running process.

---

# Session record — 2026-10-26

Development worktree only. Production and the rollback checkpoint are unchanged.
No OTA deployment, no merge to `main`.

## Build and install — succeeded

- `npm run build:native-integrated` passed (81 modules). OTA and live ads disabled.
- `npx cap copy ios` passed.
- Signed device build passed with the shared **App** scheme, Debug configuration:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`,
  `SDK_STAT_CACHE_ENABLE=NO`, `-derivedDataPath /tmp/share-water-iphone-device-build`.
  `** BUILD SUCCEEDED **`, code signature applied.
- Installed on the connected iPhone 14 (iOS 27.0.1) with `devicectl device install app`. Succeeded twice.

### Destination identifier pitfall

`devicectl`'s device identifier and the UDID that `xcodebuild -destination id=` expects are
**different values** for the same phone. Passing the `devicectl` identifier fails with
`xcodebuild: error: Unable to find a device matching the provided destination specifier`.
Read the correct UDID from the `{ platform:iOS, arch:arm64, id:... }` entry in that error's
destination list, or from `-showdestinations`.

Global `xcode-select` still points at `/Library/Developer/CommandLineTools`, so `xcrun devicectl`
and `xcrun xctrace` are unavailable. Invoked the Xcode binary by absolute path instead.
Global configuration was not altered, per `NATIVE_MAP_DEVELOPMENT.md`.

## Launch — blocked, not resolved

Every launch attempt was denied:

    FBSOpenApplicationErrorDomain error 3 — Security
    "...invalid code signature, inadequate entitlements or its profile has not been
     explicitly trusted by the user"

Ruled out as causes, each verified directly:

- Code signature: `codesign --verify --deep --strict` reports valid on disk and
  satisfies its Designated Requirement.
- Entitlements: the app's set (`application-identifier`, `com.apple.developer.team-identifier`,
  `get-task-allow`) is a strict subset of the profile's. No mismatch.
- Provisioning profile: contains this device's UDID, unexpired.
- Signing certificate: Apple Development certificate for team `QNURT5NDS4`,
  valid 2026-10-24 to 2027-10-24, private key present, single identity in the keychain
  so no possibility of having trusted a different one.
- Device: `developerModeStatus = enabled`, `pairingState = paired`, `tunnelState = connected`.

Cause is the on-device developer trust record, which `devicectl` does not expose. It stayed
at "not trusted" across repeated attempts.

### Why trust kept failing

The profile is **free Personal Team** provisioning (`TimeToLive = 7`; a paid membership
issues 365). Free-provisioned apps require iOS to verify the developer identity online
against Apple before the trust is stored. The device reached `https://ppq.apple.com`
successfully (returned `ok`), and the Mac's path to that endpoint was also clean
(DNS resolved, HTTP 200), yet Settings continued to report not trusted. An iPhone reboot
to clear a stuck trust record was proposed but not performed.

The user deleted the app during this session. Note that deleting the last app from a
developer identity removes its entry from Settings → VPN & Device Management entirely,
so the trust must be granted again after reinstalling. The existing caution against
uninstalling to resolve signing still stands; this deletion was the user's own action.

## Physical-device acceptance — NOT achieved

The app was never launched on the phone. Native map rendering, tile authentication,
real rotation, controls and long press remain **unverified on physical hardware**.
Acceptance gate 7 is still open. A successful build and install is not device acceptance.

## Apple Developer Program enrollment — in progress

The user purchased a membership on 2026-10-26. As of 23:10 KST the local state is unchanged:

- Only the free profile is installed: `TimeToLive = 7`, team `QNURT5NDS4`, expires 2026-10-31 10:35 KST.
- No Apple Distribution certificate exists in the keychain.

Payment and enrollment approval are separate steps; the status had not changed yet.
Apple does not publish an approval timeline. Common silent stalls: an unanswered Apple
request for identity documents, or a non-legal name submitted during enrollment.
Enrollment support: https://developer.apple.com/support/enrollment/

## Resume checklist

1. Confirm Membership shows **Active** at `developer.apple.com/account`.
2. Accept the Apple Developer Program License Agreement. Certificate and profile issuance
   stays blocked until this is done.
3. Xcode → Settings → Accounts → refresh the account; confirm a paid team appears
   alongside the Personal Team.
4. Compare the paid Team ID against `QNURT5NDS4`. If it differs, update `DEVELOPMENT_TEAM`
   in `ios/App/App.xcodeproj/project.pbxproj` (two locations).
5. Rebuild and reinstall. Build products live under `/tmp/share-water-iphone-device-build`,
   which the system may purge; do not assume the existing product survives.
6. Launch. A paid development profile removes the on-device online trust verification that
   blocked this session.
7. Then, and only then, verify real map tiles, rotation, controls and long press on the phone.
   Physical screenshots must come from the device; `devicectl` has no screenshot facility and
   the simulator tooling cannot drive physical hardware. Do not treat header angle readouts
   alone as rendering evidence.

Do not record passwords or verification codes in repository files. Account authentication
is completed by the user in Xcode and on the device.

## Build2 continuation — 2026-10-27 evening

The standard UIKit registration form fixes the clean simulator cancel gate. iPad popup anchoring and route-choice regression passed after clamping its card to the visible map. Build2 archive is signed and was installed as an update on the connected iPhone, then launched with process survival confirmed. Existing local ownership was preserved.

Physical XCTest did not execute: Xcode requires a new `com.sharewater.app.nativeprooftests.xctrunner` profile and currently reports `No Accounts`; fresh account count0. The previous successful build1 upload is not evidence of current login. Reuse the existing paid Team after the owner restores the account; do not delete apps, certificates or cached profiles. Store export of build2 is blocked separately by missing cloud distribution authentication. ASC browser remains logged in. See APP_STORE_RELEASE.md for the latest status.
