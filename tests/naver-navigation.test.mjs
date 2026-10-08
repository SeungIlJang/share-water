import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNaverRouteAppUrl,
  buildNaverRouteWebUrl,
  MAX_NAVER_ROUTE_LOCATIONS,
} from '../src/utils/naverNavigation.js';

const stops = [
  { latitude: 37.1, longitude: 127.1, title: '첫 음수대' },
  { latitude: 37.2, longitude: 127.2, title: '두 번째 음수대' },
  { latitude: 37.3, longitude: 127.3, title: '마지막 음수대' },
];

test('네이버 지도 웹 길찾기 URL에 모든 음수대를 선택 순서대로 넣는다', () => {
  const url = decodeURIComponent(buildNaverRouteWebUrl(stops));
  const first = url.indexOf('127.1,37.1,첫 음수대');
  const second = url.indexOf('127.2,37.2,두 번째 음수대');
  const third = url.indexOf('127.3,37.3,마지막 음수대');

  assert.ok(first > 0);
  assert.ok(first < second);
  assert.ok(second < third);
  assert.match(url, /\/walk$/);
});

test('단일 음수대는 네이버 지도 앱 도보 길찾기 스킴을 사용한다', () => {
  const url = decodeURIComponent(buildNaverRouteAppUrl([stops[0]])).replaceAll('+', ' ');
  assert.equal(
    url,
    'nmap://route/walk?dlat=37.1&dlng=127.1&dname=첫 음수대&appname=com.sharewater.app',
  );
});

test('여러 음수대는 출발지·경유지·도착지로 네이버 지도 앱에 전달한다', () => {
  const url = decodeURIComponent(buildNaverRouteAppUrl(stops)).replaceAll('+', ' ');

  assert.match(url, /^nmap:\/\/route\/walk\?/);
  assert.match(url, /slat=37.1&slng=127.1&sname=첫 음수대/);
  assert.match(url, /v1lat=37.2&v1lng=127.2&v1name=두 번째 음수대/);
  assert.match(url, /dlat=37.3&dlng=127.3&dname=마지막 음수대/);
});

test('네이버 지도 공식 한도보다 많은 경유지는 거부한다', () => {
  const tooMany = Array.from({ length: MAX_NAVER_ROUTE_LOCATIONS + 1 }, (_, index) => ({
    latitude: 37 + index / 100,
    longitude: 127 + index / 100,
    title: `${index + 1}번`,
  }));

  assert.throws(() => buildNaverRouteAppUrl(tooMany), /최대 7곳/);
});
