import { Capacitor, registerPlugin } from '@capacitor/core';

export const NativeMap = registerPlugin('WaterNativeMap');
export const nativeMapAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WaterNativeMap');

export function measureNativeMap(element) {
  const box = element.getBoundingClientRect();
  const rectangles = Array.from(document.querySelectorAll('[data-native-map-ui]')).map((control) => control.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > box.left && rect.left < box.right
      && rect.bottom > box.top && rect.top < box.bottom)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
  return { bounds: { x: box.x, y: box.y, width: box.width, height: box.height, viewportWidth: window.innerWidth }, excludedRects: rectangles };
}

export function observeNativeMapBounds(element, onError = console.warn) {
  let frame, last = '';
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const geometry = measureNativeMap(element);
      const key = JSON.stringify(geometry);
      if (key === last) return;
      last = key;
      void NativeMap.setBounds(geometry).catch(onError);
    });
  };
  const resize = new ResizeObserver(measure);
  resize.observe(element);
  const mutations = new MutationObserver(measure);
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('resize', measure);
  measure();
  return () => {
    resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
    window.visualViewport?.removeEventListener('resize', measure);
  };
}
