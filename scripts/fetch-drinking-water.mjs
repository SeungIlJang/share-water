import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

const readEnvFile = async () => {
  try {
    const text = await readFile(resolve(root, '.env'), 'utf8');
    return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) return [];
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      return [[match[1], value]];
    }));
  } catch {
    return {};
  }
};

const fileEnv = await readEnvFile();
const apiKey = process.env.DATA_SEOUL_KEY || process.env.VITE_SEOUL_API_KEY
  || fileEnv.DATA_SEOUL_KEY || fileEnv.VITE_SEOUL_API_KEY;

if (!apiKey) throw new Error('DATA_SEOUL_KEY 또는 VITE_SEOUL_API_KEY가 필요합니다.');

const service = 'TbViewGisArisu';
const pageSize = 1000;
const rows = [];
let total = Infinity;

for (let start = 1; start <= total; start += pageSize) {
  const end = start + pageSize - 1;
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${service}/${start}/${end}/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`서울시 API HTTP ${response.status}`);
  const body = await response.json();
  const result = body[service];
  if (!result || result.RESULT?.CODE !== 'INFO-000') {
    throw new Error(result?.RESULT?.MESSAGE || body.RESULT?.MESSAGE || '서울시 API 응답 오류');
  }
  total = Number(result.list_total_count || 0);
  rows.push(...(result.row || []));
}

const detailMap = (row) => {
  const details = {};
  for (let i = 1; i <= 20; i += 1) {
    const name = String(row[`CN_DTL_NM_${i}`] || '').trim();
    const value = String(row[`CN_DTL_VL_${i}`] || '').trim();
    if (name && value) details[name] = value;
  }
  return details;
};

const data = rows.map((row, index) => {
  const latitude = Number(row.YCRD);
  const longitude = Number(row.XCRD);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < 33 || latitude > 39 || longitude < 124 || longitude > 132) return null;
  const details = detailMap(row);
  const parkName = String(row.CN_PARK_NM || details['공원명'] || '공원').trim();
  return {
    id: String(row.CN_ID || `water-${index + 1}`),
    title: `${parkName} 음수대`,
    parkName,
    latitude,
    longitude,
    address: String(row.LOTNO_ADDR || details['주소'] || '').trim(),
    newAddress: String(row.ROAD_NM_ADDR || '').trim() || null,
    detailLocation: String(details['상세위치'] || '공원 내 위치').trim(),
    office: String(details['사업소'] || '').trim() || null,
    source: '서울특별시 서울 열린데이터광장',
  };
}).filter(Boolean);

await writeFile(resolve(root, 'public/data.json'), `${JSON.stringify(data)}\n`);
await writeFile(resolve(root, 'public/data-version.json'), `${JSON.stringify({
  v: Number(new Date().toISOString().slice(0, 10).replaceAll('-', '')),
  updatedAt: new Date().toISOString(),
  count: data.length,
  source: '서울시 공원음수대 정보 조회 (TbViewGisArisu)',
}, null, 2)}\n`);

console.log(`[data] 공원음수대 ${data.length.toLocaleString('ko-KR')}건 저장`);
