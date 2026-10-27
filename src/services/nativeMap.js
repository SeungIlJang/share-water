import { Capacitor, registerPlugin } from '@capacitor/core';

export const NativeMap = registerPlugin('WaterNativeMap');
export const nativeMapAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WaterNativeMap');

export function measureNativeMap(element) {
  const box = element.getBoundingClientRect();
  // UIKit/Android coordinates address the visible viewport. Safari can zoom or
  // pan that viewport when focusing a field, independently of layout CSS pixels.
  const viewport = window.visualViewport;
  const offsetX = viewport?.offsetLeft || 0;
  const offsetY = viewport?.offsetTop || 0;
  const visualRect = ({ x, y, width, height }) => ({ x: x - offsetX, y: y - offsetY, width, height });
  const rectangles = Array.from(document.querySelectorAll('[data-native-map-ui]')).map((control) => control.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > box.left && rect.left < box.right
      && rect.bottom > box.top && rect.top < box.bottom)
    .map(visualRect);
  return { bounds: { ...visualRect(box), viewportWidth: viewport?.width || window.innerWidth }, excludedRects: rectangles };
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
  window.visualViewport?.addEventListener('scroll', measure);
  window.addEventListener('scroll', measure, true);
  measure();
  return () => {
    resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
    window.visualViewport?.removeEventListener('resize', measure);
    window.visualViewport?.removeEventListener('scroll', measure);
    window.removeEventListener('scroll', measure, true);
  };
}
