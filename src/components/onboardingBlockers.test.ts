import { describe, expect, it } from 'vitest';
import { computeBlockerRects, isPointUnshielded, type Rect } from './onboardingBlockers';

const target: Rect = { top: 200, left: 40, right: 340, bottom: 300 };

describe('computeBlockerRects', () => {
  it('produces four panels', () => {
    expect(computeBlockerRects(target)).toHaveLength(4);
  });

  it('shields nothing when there is no target — never trap the user', () => {
    expect(computeBlockerRects(null)).toEqual([]);
  });

  it('leaves the padded target rectangle uncovered', () => {
    const [above, below, leftOf, rightOf] = computeBlockerRects(target, 8);
    expect(above.height).toBe(192); // stops 8px above the target
    expect(below.top).toBe(308); // resumes 8px below it
    expect(leftOf.width).toBe(32); // stops 8px left of it
    expect(rightOf.left).toBe(348); // resumes 8px right of it
  });

  it('clamps to the viewport when the target hangs off the top-left', () => {
    const offscreen: Rect = { top: -50, left: -20, right: 100, bottom: 40 };
    const [above, , leftOf] = computeBlockerRects(offscreen);
    expect(above.height).toBe(0);
    expect(leftOf.width).toBe(0);
    // Still a real side panel rather than a negative-height nothing.
    expect(leftOf.height).toBe(48);
  });
});

describe('isPointUnshielded', () => {
  // The case that matters: the control the step names has to stay pressable.
  it('lets a click on the target through', () => {
    expect(isPointUnshielded(target, 190, 250)).toBe(true);
  });

  it('blocks a click at the side of the screen', () => {
    // Exactly what was reported: tapping the edge navigated away mid-tour.
    expect(isPointUnshielded(target, 5, 250)).toBe(false);
    expect(isPointUnshielded(target, 190, 600)).toBe(false);
  });

  it('lets everything through when no target is highlighted', () => {
    expect(isPointUnshielded(null, 0, 0)).toBe(true);
  });
});
