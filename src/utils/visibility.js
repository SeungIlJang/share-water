export const visibleAreaRatio = (rect, containerRect) => {
  const width = Math.max(0, rect.right - rect.left);
  const height = Math.max(0, rect.bottom - rect.top);
  const area = width * height;
  if (!area) return 0;

  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, containerRect.right) - Math.max(rect.left, containerRect.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top),
  );
  return (visibleWidth * visibleHeight) / area;
};
