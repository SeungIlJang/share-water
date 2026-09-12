# 모두의 음수대 💧

현재 위치 주변의 서울시 아리수 공원 음수대를 찾아주는 지도 앱입니다.
Vue 3 + Vite 웹앱을 Capacitor로 Android 앱에 포함합니다.

## 주요 기능

- 현재 위치 또는 지도 중심 기준 반경 검색
- 공원명·구·동·주소·상세 위치 검색
- 거리순 목록과 지도 마커
- 네이버 지도 도보 길찾기와 주소 복사
- 공식 데이터를 앱에 포함해 네트워크 장애 시에도 위치 검색 가능

## 데이터 출처

- [서울시 공원음수대 정보 조회](https://data.seoul.go.kr/dataList/OA-20884/S/1/datasetView.do)
- 제공기관: 서울특별시 서울아리수본부
- 이용조건: 공공누리 제1유형(출처표시, 상업적 이용 및 변경 가능)

## 실행

```bash
npm install
npm run data:build
npm run dev
```

Android 빌드는 `npm run android:aab`를 사용합니다.

네이버 지도 콘솔의 Web 서비스 URL에는 Android 앱용 `https://localhost`를 등록해야 합니다.
웹 배포 시에는 실제 배포 도메인도 추가합니다.
