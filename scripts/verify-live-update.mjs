import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const localManifest = JSON.parse(await readFile(
  resolve(root, 'dist/live-update/manifest.json'),
  'utf8',
));
const manifestUrl = process.env.LIVE_UPDATE_MANIFEST_URL
  || 'https://share-water-ota.pages.dev/live-update/manifest.json';

const fetchFresh = async (url) => {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}verify=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};

let remoteManifest;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  remoteManifest = await (await fetchFresh(manifestUrl)).json();
  if (remoteManifest.version === localManifest.version) break;
  if (attempt === 10) {
    throw new Error(
      `운영 manifest 불일치: local=${localManifest.version}, remote=${remoteManifest.version}`,
    );
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
}

if (remoteManifest.checksum !== localManifest.checksum) {
  throw new Error('운영 manifest의 체크섬이 로컬 빌드와 다릅니다.');
}

const bundle = Buffer.from(await (await fetchFresh(remoteManifest.url)).arrayBuffer());
const downloadedChecksum = createHash('sha256').update(bundle).digest('hex');
if (downloadedChecksum !== localManifest.checksum) {
  throw new Error(
    `운영 ZIP 체크섬 불일치: expected=${localManifest.checksum}, actual=${downloadedChecksum}`,
  );
}

console.log(`[live-update] verified ${remoteManifest.version} (${bundle.length} bytes)`);
