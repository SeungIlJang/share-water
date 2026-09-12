import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';

const root = process.cwd();
const distDir = join(root, 'dist');
const updateDir = join(distDir, 'live-update');
const publicOrigin = (process.env.LIVE_UPDATE_ORIGIN || 'https://share-water.onrender.com').replace(/\/$/, '');

const listFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'live-update') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

const hashFiles = async (files) => {
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(relative(distDir, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
};

const zipDirectory = (outputPath) => new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.glob('**/*', { cwd: distDir, dot: false, ignore: ['live-update/**'] });
  archive.finalize();
});

const hashFile = async (path) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
  stream.on('error', reject);
});

await rm(updateDir, { recursive: true, force: true });
await mkdir(updateDir, { recursive: true });

const files = await listFiles(distDir);
const contentHash = await hashFiles(files);
const version = `web-${contentHash.slice(0, 16)}`;
const bundleName = `${version}.zip`;
const bundlePath = join(updateDir, bundleName);

await zipDirectory(bundlePath);
const checksum = await hashFile(bundlePath);
const size = (await stat(bundlePath)).size;
const manifest = {
  version,
  url: `${publicOrigin}/live-update/${bundleName}`,
  checksum,
  size,
  createdAt: new Date().toISOString(),
};

await writeFile(join(updateDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[live-update] ${version} (${(size / 1024 / 1024).toFixed(2)} MB)`);
