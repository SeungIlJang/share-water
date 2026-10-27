import test from 'node:test';
import assert from 'node:assert/strict';
import { measureNativeMap } from '../src/services/nativeMap.js';

const rect = (x,y,width,height) => ({ x,y,width,height,left:x,top:y,right:x+width,bottom:y+height });
test('native touch exclusions follow the visual viewport when iOS focuses a form', () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  try {
    globalThis.window = { innerWidth: 390, visualViewport: { width: 312, offsetLeft: 20, offsetTop: 80 } };
    const map = { getBoundingClientRect: () => rect(0,0,390,600) };
    globalThis.document = { querySelectorAll: () => [
      { getBoundingClientRect: () => rect(0,0,390,780) },
      { getBoundingClientRect: () => rect(0,610,390,100) },
    ] };
    const result = measureNativeMap(map);
    assert.deepEqual(result.bounds, { x:-20,y:-80,width:390,height:600,viewportWidth:312 });
    assert.deepEqual(result.excludedRects, [{ x:-20,y:-80,width:390,height:780 }]);
    globalThis.window.visualViewport = undefined;
    assert.deepEqual(measureNativeMap(map).bounds, {x:0,y:0,width:390,height:600,viewportWidth:390});
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('native information actions remain within an iPad map after a keyboard transition', async () => {
  const { clampNativePopup } = await import('../src/services/nativeMap.js');
  const map = rect(0, 0, 1032, 1110), viewport = { width:1032,height:1376 };
  const p = clampNativePopup({x:516,y:-300},map,viewport,260);
  assert.equal(p.x,516);
  assert.ok(p.y-52-260 >= 12);
  assert.ok(p.y < map.bottom);
  assert.deepEqual(clampNativePopup({x:516,y:600},map,viewport,260), {x:516,y:600});
  const edge = clampNativePopup({x:2000,y:2000},map,viewport,260);
  assert.ok(edge.x+140 <= 1020);
  assert.ok(edge.y <= 1098);
});
