/**
 * Which subscription the onboarding tour walks through.
 *
 * The `dashboard-subscription` anchor and the routes of the steps that follow it
 * MUST name the same subscription. The anchor sits on the first card of the
 * multi-tariff list, or on the single-tariff card otherwise; the next steps
 * navigate to `/subscriptions/<id>`. If those two disagree the user taps the
 * highlighted card, lands on a screen the tour is not expecting, and the tour
 * silently stops — which is exactly what happened once this was written as
 * `subscription ?? list[0]`: that reads the single-tariff subscription first,
 * and a multi-tariff account can have one that is not the card being pointed at.
 *
 * Kept as a plain function so the invariant is testable without rendering the
 * whole dashboard.
 */
export interface TourSubscriptionCandidate {
  id: number;
}

// Two type parameters on purpose: the single-tariff subscription and the list
// items are different shapes in the API, and the tour only needs what they share.
export function pickTourSubscription<
  S extends TourSubscriptionCandidate,
  L extends TourSubscriptionCandidate,
>(
  isMultiTariff: boolean,
  singleSubscription: S | null | undefined,
  listSubscriptions: readonly L[] | null | undefined,
): S | L | null {
  if (isMultiTariff) {
    // The list drives the anchor here, so the list drives the routes too —
    // never the single-tariff subscription, whatever the backend puts in it.
    return listSubscriptions?.[0] ?? null;
  }
  return singleSubscription ?? null;
}
