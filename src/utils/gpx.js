const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const buildGpx = ({ name, coordinates, waypoints = [] }) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('GPX로 저장할 경로 좌표가 없습니다.');
  }
  const safeName = xmlEscape(name || '모두의 음수대 코스');
  const waypointXml = waypoints.map((point, index) => (
    `  <wpt lat="${point.latitude}" lon="${point.longitude}"><name>${xmlEscape(point.title || `${index + 1}번째 음수대`)}</name></wpt>`
  )).join('\n');
  const trackXml = coordinates.map((point) => (
    `      <trkpt lat="${point.latitude}" lon="${point.longitude}"></trkpt>`
  )).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="모두의 음수대" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${safeName}</name></metadata>
${waypointXml}
  <trk><name>${safeName}</name><trkseg>
${trackXml}
  </trkseg></trk>
</gpx>\n`;
};

export const createGpxFilename = (date = new Date()) => {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
  return `share-water-course-${stamp}.gpx`;
};
