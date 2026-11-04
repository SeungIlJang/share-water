import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const assertNativeMapAndLiveUpdate = (scriptName) => {
  const script = packageJson.scripts[scriptName];
  assert.match(script, /VITE_NATIVE_MAP_ENABLED=true/);
  assert.match(script, /VITE_LIVE_UPDATE_ENABLED=true/);
  assert.match(script, /verify:android:store-assets/);
};

test('Android Store build includes native map and live update', () => {
  assertNativeMapAndLiveUpdate('build:android:store');
});

test('OTA build includes native map and live update', () => {
  assertNativeMapAndLiveUpdate('build:ota');
  assert.match(packageJson.scripts['ota:deploy'], /npm run build:ota/);
});
