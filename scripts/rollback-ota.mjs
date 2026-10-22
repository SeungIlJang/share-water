import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checkpoint = process.argv[2] && resolve(process.argv[2]);
if (!checkpoint || process.argv.slice(3).some((arg) => arg !== '--apply')) {
  throw new Error('Usage: node rollback-ota.mjs <checkpoint-directory> [--apply] (default: verify only)');
}
const metadata = JSON.parse(await readFile(resolve(checkpoint, 'checkpoint.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const artifact of metadata.artifacts) {
  const path = resolve(checkpoint, artifact.path);
  if (!path.startsWith(checkpoint + sep)) throw new Error('Invalid artifact path');
  const bytes = await readFile(path);
  if (bytes.length !== artifact.size || sha256(bytes) !== artifact.sha256) {
    throw new Error(`Checkpoint integrity check failed: ${artifact.path}`);
  }
}
const manifest = JSON.parse(await readFile(resolve(checkpoint, 'ota-dist/live-update/manifest.json'), 'utf8'));
const zip = await readFile(resolve(checkpoint, `ota-dist/live-update/${manifest.version}.zip`));
if (manifest.version !== metadata.ota.version || sha256(zip) !== manifest.checksum
  || manifest.checksum !== metadata.ota.checksum || zip.length !== manifest.size) {
  throw new Error('Checkpoint OTA manifest/ZIP mismatch');
}
console.log(`Verified checkpoint: ${metadata.tag}, ${manifest.version}; ${metadata.artifacts.length} files`);
if (!process.argv.includes('--apply')) {
  console.log('Verify-only: no deployment, source checkout, native installation, or database changes performed.');
  process.exit(0);
}
console.log('Restoring WEB OTA ONLY. Installed native binaries and database records are unchanged.');
const result = spawnSync('npx', ['--yes', 'wrangler@4.141.0', 'pages', 'deploy',
  resolve(checkpoint, 'ota-dist'), '--project-name', 'share-water-ota', '--branch', 'main', '--commit-dirty=true'], {
  cwd: dirname(fileURLToPath(import.meta.url)), stdio: 'inherit',
});
if (result.error || result.status !== 0) throw result.error || new Error('OTA restore deployment failed');
const origin = 'https://share-water-ota.pages.dev';
let restored;
for (let attempt = 0; attempt < 10; attempt++) {
  const response = await fetch(`${origin}/live-update/manifest.json?verify=${Date.now()}`, {
    signal: AbortSignal.timeout(30_000), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Manifest verification HTTP ${response.status}`);
  restored = await response.json();
  if (restored.version === manifest.version && restored.checksum === manifest.checksum) break;
  if (attempt === 9) throw new Error('Production manifest does not match rollback checkpoint');
  await new Promise((done) => setTimeout(done, 2000));
}
if (restored.url !== `${origin}/live-update/${manifest.version}.zip`) throw new Error('Unexpected restored ZIP URL');
const response = await fetch(`${restored.url}?verify=${Date.now()}`, { signal: AbortSignal.timeout(30_000) });
if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== manifest.checksum) {
  throw new Error('Production rollback ZIP checksum verification failed');
}
console.log(`Production OTA restored and checksum verified: ${manifest.version}`);
