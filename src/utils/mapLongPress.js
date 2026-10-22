// 지도 이동·확대 제스처와 구분되는 단일 포인터 길게 누르기.
export function installMapLongPress(element, onHold, { delay = 650 } = {}) {
  let timer;
  let start;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  const down = (event) => {
    cancel();
    if (!event.isPrimary || event.button !== 0
      || event.target.closest('button, a, input, .water-marker, .info-window, [role="button"]')) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer = setTimeout(() => {
      if (!start) return;
      const rect = element.getBoundingClientRect();
      const point = { x: start.x - rect.left, y: start.y - rect.top };
      cancel();
      onHold(point);
    }, delay);
  };
  const move = (event) => {
    if (start && event.pointerId === start.id
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  };
  const contextMenu = (event) => {
    if (!event.target.closest('.water-marker, .info-window, button, a')) event.preventDefault();
  };
  const handlers = { pointerdown: down, pointermove: move, pointerup: cancel,
    pointercancel: cancel, pointerleave: cancel, contextmenu: contextMenu };
  for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler, true);
  return () => {
    cancel();
    for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler, true);
  };
}
