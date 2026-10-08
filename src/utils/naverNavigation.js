const encodeRoutePoint = ({ latitude, longitude, title }) => (
  `${longitude},${latitude},${encodeURIComponent(title || '음수대')},,PLACE_POI`
);

export const MAX_NAVER_ROUTE_LOCATIONS = 7;

export const buildNaverRouteWebUrl = (locations) => (
  `https://map.naver.com/p/directions/-/${locations.map(encodeRoutePoint).join('/')}/-/walk`
);

const appendLocation = (params, prefix, { latitude, longitude, title }) => {
  params.set(`${prefix}lat`, latitude);
  params.set(`${prefix}lng`, longitude);
  params.set(`${prefix}name`, title || '음수대');
};

export const buildNaverRouteAppUrl = (locations) => {
  if (!locations.length) throw new Error('길찾기 위치가 필요합니다.');
  if (locations.length > MAX_NAVER_ROUTE_LOCATIONS) {
    throw new Error(`네이버 지도 경로는 최대 ${MAX_NAVER_ROUTE_LOCATIONS}곳까지 지원합니다.`);
  }

  const params = new URLSearchParams();
  if (locations.length > 1) {
    appendLocation(params, 's', locations[0]);
    locations.slice(1, -1).forEach((location, index) => {
      appendLocation(params, `v${index + 1}`, location);
    });
  }
  appendLocation(params, 'd', locations.at(-1));
  params.set('appname', 'com.sharewater.app');
  return `nmap://route/walk?${params.toString().replaceAll('+', '%20')}`;
};
