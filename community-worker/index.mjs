import { getDistanceKm } from '../src/utils/distance.js';

const origins = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost:5173',
  'http://localhost:5176', 'https://share-water-ota.pages.dev']);
const idPattern = /^custom-[a-f0-9-]{36}$/;
const tokenFrom = (request) => request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, '0')).join('');
const toPublic = async (row, ownerHash) => ({
  contributorId: await hash(`public-contributor:${row.owner_hash}`),
  id: row.id, title: row.title, detailLocation: row.detail, latitude: row.latitude,
  longitude: row.longitude, address: `위도 ${row.latitude.toFixed(6)} · 경도 ${row.longitude.toFixed(6)}`,
  source: '사용자 등록 · 현장 확인 필요', custom: true, shared: true,
  owned: !!ownerHash && row.owner_hash === ownerHash, createdAt: row.created_at,
});

export function validatePoint(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const detail = typeof body?.detailLocation === 'string' ? body.detailLocation.trim() : '';
  if (/(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:0[1278]0[- ]?\d{3,4}[- ]?\d{4})|씨발|시발|개새끼|병신|fuck|porn)/i.test(`${title} ${detail}`)) return null;
  if (!idPattern.test(body?.id || '') || !title || title.length > 80 || detail.length > 200
    || !Number.isFinite(body.latitude) || Math.abs(body.latitude) > 90
    || !Number.isFinite(body.longitude) || Math.abs(body.longitude) > 180) return null;
  return { id: body.id, title, detail, latitude: body.latitude, longitude: body.longitude };
}

async function readSmallJson(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new Error('BAD_BODY');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BAD_BODY');
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 4096) { await reader.cancel(); throw new Error('BAD_BODY'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': origins.has(origin) ? origin : '',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Vary': 'Origin', 'Cache-Control': 'no-store',
    };
    const json = (data, status = 200) => Response.json(data, { status, headers: cors });
    if (origin && !origins.has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });
    try {
      const token = tokenFrom(request);
      const ownerHash = token ? await hash(token) : null;
      if (url.pathname === '/water' && request.method === 'GET') {
        const cursor = url.searchParams.get('cursor') || '';
        if (cursor && !idPattern.test(cursor)) return json({ error: '잘못된 조회 요청입니다.' }, 400);
        const { results } = await env.DB.prepare('SELECT * FROM water_points WHERE id > ? AND owner_hash NOT IN (SELECT owner_hash FROM blocked_contributors) ORDER BY id LIMIT 501').bind(cursor).all();
        const page = results.slice(0, 500);
        return json({ items: await Promise.all(page.map((row) => toPublic(row, ownerHash))),
          cursor: results.length > 500 ? page.at(-1).id : null });
      }
      if (url.pathname === '/water' && request.method === 'POST') {
        if (!ownerHash) return json({ error: '기기 등록 정보가 필요합니다.' }, 401);
        if (await env.DB.prepare('SELECT owner_hash FROM blocked_contributors WHERE owner_hash=?').bind(ownerHash).first()) return json({ error: '이 기기는 등록이 제한되어 있습니다.' }, 403);
        let body;
        try { body = await readSmallJson(request); } catch { return json({ error: '등록 내용을 확인해 주세요.' }, 400); }
        const point = validatePoint(body);
        if (!point) return json({ error: '음수대 이름과 지도 위치를 확인해 주세요.' }, 400);
        const existing = await env.DB.prepare('SELECT * FROM water_points WHERE id=?').bind(point.id).first();
        if (existing) {
          if (existing.owner_hash !== ownerHash) return json({ error: '이미 등록된 음수대입니다.' }, 409);
          return json({ item: await toPublic(existing, ownerHash) });
        }
        if (env.WRITE_LIMITER && !(await env.WRITE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || ownerHash })).success) {
          return json({ error: '등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
        }
        const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM water_points WHERE owner_hash=? AND created_at > datetime('now','-1 day')").bind(ownerHash).first();
        if (count.total >= 50) return json({ error: '하루 등록 한도에 도달했습니다. 내일 다시 시도해 주세요.' }, 429);
        const { results: nearby } = await env.DB.prepare('SELECT latitude,longitude FROM water_points WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?')
          .bind(point.latitude - 0.0001, point.latitude + 0.0001, point.longitude - 0.0002, point.longitude + 0.0002).all();
        if (nearby.some((item) => getDistanceKm(point.latitude, point.longitude, item.latitude, item.longitude) < 0.01)) {
          return json({ error: '이 위치 주변에 이미 공유된 음수대가 있습니다.' }, 409);
        }
        try {
          await env.DB.prepare('INSERT INTO water_points(id,title,detail,latitude,longitude,location_key,owner_hash) VALUES(?,?,?,?,?,?,?)')
            .bind(point.id, point.title, point.detail, point.latitude, point.longitude,
              `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`, ownerHash).run();
        } catch (error) {
          if (String(error).includes('UNIQUE')) return json({ error: '이미 등록된 음수대입니다.' }, 409);
          throw error;
        }
        const saved = await env.DB.prepare('SELECT * FROM water_points WHERE id=?').bind(point.id).first();
        return json({ item: await toPublic(saved, ownerHash) }, 201);
      }
      const reportMatch = url.pathname.match(/^\/water\/(custom-[a-f0-9-]{36})\/report$/);
      if (reportMatch && request.method === 'POST') {
        if (!ownerHash) return json({ error: '기기 등록 정보가 필요합니다.' }, 401);
        let body;
        try { body = await readSmallJson(request); } catch { return json({ error: '신고 내용을 확인해 주세요.' }, 400); }
        if (!['incorrect', 'inappropriate', 'personal-info'].includes(body.reason)) return json({ error: '신고 사유를 선택해 주세요.' }, 400);
        if (!await env.DB.prepare('SELECT id FROM water_points WHERE id=?').bind(reportMatch[1]).first()) return json({ error: '이미 삭제된 음수대입니다.' }, 404);
        if (env.WRITE_LIMITER && !(await env.WRITE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || ownerHash })).success) return json({ error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
        await env.DB.prepare('INSERT OR IGNORE INTO water_reports(point_id,reporter_hash,reason) VALUES(?,?,?)').bind(reportMatch[1], ownerHash, body.reason).run();
        return json({ reported: true });
      }
      const match = url.pathname.match(/^\/water\/(custom-[a-f0-9-]{36})$/);
      if (match && request.method === 'DELETE') {
        if (!ownerHash) return json({ error: '등록한 기기에서만 삭제할 수 있습니다.' }, 401);
        const record = await env.DB.prepare('SELECT * FROM water_points WHERE id=?').bind(match[1]).first();
        if (!record) return json({ deleted: true });
        if (record.owner_hash !== ownerHash) return json({ error: '등록한 기기에서만 삭제할 수 있습니다.' }, 403);
        await env.DB.prepare('DELETE FROM water_points WHERE id=? AND owner_hash=?').bind(match[1], ownerHash).run();
        return json({ deleted: true });
      }
      return json({ error: '요청한 기능을 찾을 수 없습니다.' }, 404);
    } catch {
      return json({ error: '공유 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
    }
  },
};
