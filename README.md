# 모두의 음수대 💧

현재 위치 주변의 수도권 음수대와 식수 가능 지점을 찾아주는 지도 앱입니다.
Vue 3 + Vite 웹앱을 Capacitor로 Android 앱에 포함합니다.

## 주요 기능

- 현재 위치 또는 지도 중심 기준 반경 검색
- 공원명·구·동·주소·상세 위치 검색
- 거리순 목록과 지도 마커
- 네이버 지도 도보 길찾기와 주소 복사
- 모바일 하단 손잡이를 아래로 쓸어 검색·목록 접기, 위로 쓸어 기본 높이 복원
- 지도 빈 곳을 약 0.65초 길게 눌러 음수대 전체 공개 등록(이름·위치 메모)
- 공개 데이터를 앱에 포함해 네트워크 장애 시에도 위치 검색 가능

새로 등록한 음수대는 **모든 사용자에게 공유**되며 검색·지도·길찾기에서 함께 사용할 수 있습니다.
사용자 등록 지점은 공공데이터와 구분하여 `사용자 공유 · 현장 확인 필요`로 표시합니다.
등록한 기기에만 삭제 버튼이 보이고 서버에서도 기기 소유권을 확인합니다.
기존 기기 전용 지점은 자동 공개하지 않으며 목록의 `전체 공개` 버튼으로 공유할 수 있습니다.
공유 목록은 앱을 열거나 다시 활성화할 때, 그리고 사용 중 1분 간격으로 새로 조회합니다.
네트워크 장애 시 마지막 공유 목록을 표시합니다.

## 사용자 공유 API

- Worker: `https://share-water-community-api.season-masil.workers.dev`
- D1: `share-water-community`
- 배포: `npx wrangler deploy --config community-worker/wrangler.jsonc`
- 초기 스키마: `npx wrangler d1 execute share-water-community --remote --file community-worker/schema.sql --config community-worker/wrangler.jsonc`
- `GET /water`: 공개 목록(500개씩 cursor 페이지), 선택적 기기 토큰으로 본인 항목 식별
- `POST /water`: 기기 토큰 필수, 등록·동일 ID 재시도 지원
- `DELETE /water/:id`: 등록 기기 토큰 필수

기기 토큰은 앱의 localStorage에만 보관하고 서버에는 SHA-256 해시만 저장합니다.
공개 응답에 토큰·해시·IP 주소를 포함하지 않습니다. 앱 데이터 삭제/재설치로 토큰을 잃으면
기존 공유 지점은 유지되지만 본인 삭제 권한은 복구되지 않으므로 운영자 처리가 필요합니다.
잘못된 지점은 운영자가 D1에서 해당 ID를 확인 후 삭제할 수 있습니다(공공데이터 DB와 별개).
10m 내 중복 등록·잘못된 좌표·과도한 본문을 거부하며 IP별 분당 10회, 기기별 하루 50회 등록을 제한합니다.
추가 유료 플랫폼 없이 기존 Cloudflare Workers/D1 구성을 사용합니다.

## 데이터 출처

- [서울시 공원음수대 정보 조회](https://data.seoul.go.kr/dataList/OA-20884/S/1/datasetView.do)
- 제공기관: 서울특별시 서울아리수본부
- 이용조건: 공공누리 제1유형(출처표시, 상업적 이용 및 변경 가능)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) 수도권 식수 가능 지점
- 저작권: OpenStreetMap contributors, ODbL
- [남양주시 공식 공원 현황](https://nyj.go.kr/www/contents.do?key=3178) 등 지자체 공식 시설 정보

개별 좌표가 공개되지 않고 공원별 설치 수량만 확인되는 경우에는 공원 대표 위치로
표시하며, 앱 화면에 `개별 음수대 좌표 미확인` 안내를 함께 노출합니다.

`public/data.json`의 OpenStreetMap 파생 항목은 ODbL 1.0으로 제공되며,
서울시 원본 항목에는 공공누리 제1유형 조건이 유지됩니다.

서울시 공식 좌표를 우선 사용하고, 경기도·인천 및 공식 데이터에 없는 지점은
OpenStreetMap의 `amenity=drinking_water` 또는 `drinking_water=yes` 항목으로 보완합니다.

## Android OTA 업데이트

Android 네이티브 앱은 최초 1회 OTA 기능이 포함된 AAB를 설치한 뒤,
`https://share-water-ota.pages.dev/live-update/manifest.json`에서 새 웹 번들을 확인합니다.
정상 실행이 확인되지 않으면 Capacitor Updater의 자동 롤백을 사용하며,
다운로드한 번들은 앱을 다시 실행할 때 적용합니다.

```bash
LIVE_UPDATE_ORIGIN=https://share-water-ota.pages.dev npm run build
npx wrangler pages deploy dist --project-name share-water-ota --branch main
```
현장 운영 여부와 수질 상태는 계절·시설 사정에 따라 달라질 수 있습니다.

## 실행

```bash
npm install
npm run data:build
npm run dev
```

Android 빌드는 `npm run android:aab`를 사용합니다.

네이버 지도 콘솔의 Web 서비스 URL에는 Android 앱용 `https://localhost`를 등록해야 합니다.
웹 배포 시에는 실제 배포 도메인도 추가합니다.
