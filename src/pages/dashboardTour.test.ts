import { describe, expect, it } from 'vitest';
import { pickTourSubscription } from './dashboardTour';

const sub = (id: number) => ({ id });

describe('pickTourSubscription', () => {
  it('follows the list in multi-tariff mode — that is where the anchor sits', () => {
    expect(pickTourSubscription(true, sub(48), [sub(80), sub(48)])).toEqual(sub(80));
  });

  // The regression this function exists for: a multi-tariff account whose
  // single-tariff subscription is populated and is NOT the first card. Reading
  // it first pointed the steps at /subscriptions/48 while the highlighted card
  // navigated to /subscriptions/80, and the tour stopped on the first tap.
  it('ignores the single subscription in multi-tariff mode even when set', () => {
    const picked = pickTourSubscription(true, sub(48), [sub(80)]);
    expect(picked?.id).toBe(80);
  });

  it('uses the single subscription outside multi-tariff mode', () => {
    expect(pickTourSubscription(false, sub(48), [sub(80)])).toEqual(sub(48));
  });

  it('returns null when multi-tariff has no subscriptions yet', () => {
    expect(pickTourSubscription(true, sub(48), [])).toBeNull();
    expect(pickTourSubscription(true, sub(48), undefined)).toBeNull();
  });

  it('returns null when there is nothing at all', () => {
    expect(pickTourSubscription(false, null, null)).toBeNull();
  });
});
