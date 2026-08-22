/**
 * The four panels that shield the screen during a tour step, arranged as a frame
 * around the highlighted control so its own rectangle stays uncovered.
 *
 * That hole is the whole point. The tour asks the user to press real controls
 * ("Активировать бесплатно", "Подключить устройство"), so a shield that covered
 * everything would make those steps impossible to complete. Getting the hole
 * wrong is worse than having no shield at all, which is why this lives apart
 * from the component and is tested directly.
 */
export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface BlockerRect {
  top: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}

export function computeBlockerRects(target: Rect | null, pad = 8): BlockerRect[] {
  if (!target) return [];

  // Clamped to the viewport edge: a target scrolled partly off screen would
  // otherwise produce a negative-height panel, which renders as nothing and
  // leaves that side unshielded.
  const top = Math.max(0, target.top - pad);
  const bottom = target.bottom + pad;
  const left = Math.max(0, target.left - pad);
  const right = target.right + pad;
  const height = Math.max(0, bottom - top);

  return [
    { top: 0, left: 0, right: 0, height: top },
    { top: bottom, left: 0, right: 0, bottom: 0 },
    { top, left: 0, width: left, height },
    { top, left: right, right: 0, height },
  ];
}

/** True when the point falls inside the hole — i.e. the click reaches the page. */
export function isPointUnshielded(target: Rect | null, x: number, y: number, pad = 8): boolean {
  if (!target) return true;
  return (
    x >= target.left - pad &&
    x <= target.right + pad &&
    y >= target.top - pad &&
    y <= target.bottom + pad
  );
}
