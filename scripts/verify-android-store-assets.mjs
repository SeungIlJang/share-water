import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

const listJavaScript = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScript(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
};

const files = await listJavaScript(distDir);
const bundle = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
const required = [
  ['native map plugin', 'WaterNativeMap'],
  ['live update manifest', 'share-water-ota.pages.dev/live-update/manifest.json'],
  ['live update status', '업데이트 확인 중...'],
];

const missing = required.filter(([, marker]) => !bundle.includes(marker));
if (missing.length > 0) {
  throw new Error(`Android Store/OTA 번들 누락: ${missing.map(([name]) => name).join(', ')}`);
}

console.log(`[release-assets] verified native map + live update (${files.length} JS files)`);
