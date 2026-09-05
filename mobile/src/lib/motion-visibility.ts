export function intersectsMotionViewport(top: number, height: number, viewportTop: number, viewportHeight: number) {
  if (![top, height, viewportTop, viewportHeight].every(Number.isFinite) || height <= 0 || viewportHeight <= 0) return false;
  // Begin a little before the section reaches the visible area while keeping long
  // sections revealable even when a user scrolls straight into their middle.
  const lead = Math.min(48, viewportHeight * .08);
  return top < viewportTop + viewportHeight + lead && top + height > viewportTop;
}
