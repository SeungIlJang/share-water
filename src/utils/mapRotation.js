export const angleBetweenTouches = (touches) => {
  if (!touches || touches.length < 2) return null;
  const [first, second] = touches;
  return Math.atan2(
    second.clientY - first.clientY,
    second.clientX - first.clientX,
  ) * (180 / Math.PI);
};

export const normalizeRotationDelta = (delta) => {
  let normalized = delta % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
};

export const normalizeBearing = (bearing) => {
  const normalized = bearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const rotateScreenDelta = (deltaX, deltaY, bearing) => {
  const radians = (-bearing * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: deltaX * cosine - deltaY * sine,
    y: deltaX * sine + deltaY * cosine,
  };
};

export const mapPanOffsetForScreenDrag = (deltaX, deltaY, bearing) => {
  const rotated = rotateScreenDelta(deltaX, deltaY, bearing);
  return { x: -rotated.x, y: -rotated.y };
};
