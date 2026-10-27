import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import api from '../community-worker/index.mjs';

const owner = 'a'.repeat(64), other = 'b'.repeat(64);
const point = () => ({ id: `custom-${crypto.randomUUID()}`, title: '공유 음수대', detailLocation: '공원 입구', latitude: 37.5, longitude: 127.1 });
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../community-worker/schema.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) {
    const statement = db.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: statement.run(...args) }; },
    };
  } }, WRITE_LIMITER: { limit: async () => ({ success: true }) } };
  const request = (path, { method = 'GET', token, body, origin = 'https://localhost' } = {}) => api.fetch(new Request(`https://api.example${path}`, {
    method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { db, env, request };
}

test('공유 등록은 다른 기기에도 보이며 소유권 비밀값은 공개하지 않는다', async () => {
  const { db, request } = setup();
  try {
    const p = point();
    const created = await request('/water', { method: 'POST', token: owner, body: p });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).item.owned, true);
    const publicResult = await request('/water');
    assert.equal(publicResult.headers.get('Cache-Control'), 'no-store');
    const publicData = await publicResult.json();
    assert.equal(publicData.items.length, 1);
    assert.equal(publicData.items[0].shared, true);
    assert.equal(publicData.items[0].owned, false);
    assert.equal('owner_hash' in publicData.items[0], false);
    assert.equal(JSON.stringify(publicData).includes(owner), false);
    assert.equal((await (await request('/water', { token: owner })).json()).items[0].owned, true);
    assert.equal((await (await request('/water', { token: other })).json()).items[0].owned, false);
  } finally { db.close(); }
});

test('본인 기기에서만 공유 음수대를 삭제할 수 있다', async () => {
  const { db, request } = setup();
  try {
    const p = point();
    await request('/water', { method: 'POST', token: owner, body: p });
    assert.equal((await request(`/water/${p.id}`, { method: 'DELETE' })).status, 401);
    assert.equal((await request(`/water/${p.id}`, { method: 'DELETE', token: other })).status, 403);
    assert.equal((await (await request('/water')).json()).items.length, 1);
    assert.equal((await request(`/water/${p.id}`, { method: 'DELETE', token: owner })).status, 200);
    assert.equal((await (await request('/water')).json()).items.length, 0);
  } finally { db.close(); }
});

test('등록 재시도는 중복 생성하지 않고 가까운 중복·잘못된 값은 거부한다', async () => {
  const { db, request } = setup();
  try {
    const p = point();
    await request('/water', { method: 'POST', token: owner, body: p });
    assert.equal((await request('/water', { method: 'POST', token: owner, body: p })).status, 200);
    assert.equal((await request('/water', { method: 'POST', token: other, body: p })).status, 409);
    assert.equal((await request('/water', { method: 'POST', token: other, body: { ...p, id: point().id, latitude: 37.50001 } })).status, 409);
    for (const invalid of [{ title: '' }, { latitude: 91 }, { longitude: '127' }, { id: "' OR 1=1" }]) {
      assert.equal((await request('/water', { method: 'POST', token: owner, body: { ...point(), ...invalid } })).status, 400);
    }
    assert.equal((await (await request('/water')).json()).items.length, 1);
  } finally { db.close(); }
});

test('CORS·인증·본문 크기·등록 속도 제한을 적용한다', async () => {
  const { db, env, request } = setup();
  try {
    assert.equal((await request('/water', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/water', { method: 'OPTIONS' })).status, 204);
    assert.equal((await request('/water', { method: 'POST', body: point() })).status, 401);
    assert.equal((await request('/water', { method: 'POST', token: owner, body: { ...point(), title: 'a'.repeat(5000) } })).status, 400);
    env.WRITE_LIMITER.limit = async () => ({ success: false });
    assert.equal((await request('/water', { method: 'POST', token: owner, body: point() })).status, 429);
  } finally { db.close(); }
});

test('공유 음수대가 500개를 넘어도 페이지를 통해 모두 조회한다', async () => {
  const { db, request } = setup();
  try {
    const insert = db.prepare('INSERT INTO water_points(id,title,latitude,longitude,location_key,owner_hash) VALUES(?,?,?,?,?,?)');
    for (let i = 0; i < 501; i++) insert.run(`custom-${crypto.randomUUID()}`, '음수대', 37, 127, String(i), 'hash');
    const first = await (await request('/water')).json();
    assert.equal(first.items.length, 500);
    assert.ok(first.cursor);
    const second = await (await request(`/water?cursor=${first.cursor}`)).json();
    assert.equal(second.items.length, 1);
    assert.equal(second.cursor, null);
  } finally { db.close(); }
});

test('신고 접수는 비공개·중복 방지이며 차단된 등록자의 글과 재등록을 제한한다', async () => {
  const { db, request } = setup();
  try {
    const p = point();
    const created = await (await request('/water', { method: 'POST', token: owner, body: p })).json();
    assert.match(created.item.contributorId, /^[a-f0-9]{64}$/);
    const sameAuthor = await (await request('/water', { token: other })).json();
    assert.equal(sameAuthor.items[0].contributorId, created.item.contributorId);
    assert.equal((await request(`/water/${p.id}/report`, { method: 'POST', body: { reason: 'incorrect' } })).status, 401);
    assert.equal((await request(`/water/${p.id}/report`, { method: 'POST', token: other, body: { reason: 'bad' } })).status, 400);
    for (let i = 0; i < 2; i++) assert.equal((await request(`/water/${p.id}/report`, { method: 'POST', token: other, body: { reason: 'inappropriate' } })).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM water_reports').get().n, 1);
    assert.equal(JSON.stringify(await (await request('/water')).json()).includes('reporter_hash'), false);
    db.prepare('INSERT INTO blocked_contributors(owner_hash) SELECT owner_hash FROM water_points WHERE id=?').run(p.id);
    assert.equal((await (await request('/water')).json()).items.length, 0);
    assert.equal((await request('/water', { method: 'POST', token: owner, body: { ...point(), latitude: 38 } })).status, 403);
    // Moderation must not revoke an owner's deletion capability.
    assert.equal((await request(`/water/${p.id}`, { method: 'DELETE', token: owner })).status, 200);
  } finally { db.close(); }
});

test('공개 제보에서 광고 링크·연락처·명백한 욕설을 거부한다', async () => {
  const { db, request } = setup();
  try {
    for (const text of ['https://spam.example', 'user@example.com', '010-1234-5678', '씨발', '<script>alert(1)</script>']) {
      assert.equal((await request('/water', { method: 'POST', token: owner, body: { ...point(), detailLocation: text } })).status, 400);
    }
    assert.equal((await request('/water', { method: 'POST', token: owner, body: point() })).status, 201);
  } finally { db.close(); }
});
