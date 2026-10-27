import { Capacitor, registerPlugin } from '@capacitor/core';

export const NativeMap = registerPlugin('WaterNativeMap');
export const nativeMapAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WaterNativeMap');

// A keyboard/viewport transition can temporarily project the selected marker
// outside the visible map. Keep its actionable card on screen during that move.
export function clampNativePopup(point, map, viewport, height = 260, width = 280) {
  const inset = 12, gap = 52;
  const left = Math.max(0, map.left), right = Math.min(viewport.width, map.right);
  const top = Math.max(0, map.top), bottom = Math.min(viewport.height, map.bottom);
  const minX = left + width / 2 + inset, maxX = right - width / 2 - inset;
  const minY = top + height + gap + inset, maxY = bottom - inset;
  return {
    x: (viewport.offsetLeft || 0) + (minX <= maxX ? Math.max(minX, Math.min(maxX, point.x)) : (left + right) / 2),
    y: (viewport.offsetTop || 0) + (minY <= maxY ? Math.max(minY, Math.min(maxY, point.y)) : maxY),
  };
}

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
