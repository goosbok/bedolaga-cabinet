import { create } from 'zustand';
import type { OnboardingStep } from '../components/Onboarding';
import { ANCHOR_CONNECT } from '../components/connection/blocks/anchors';

/** Kept from the original two-step tour: users who already dismissed it stay dismissed. */
export const ONBOARDING_STORAGE_KEY = 'onboarding_completed';

/** Guarded because vitest runs this module in a `node` environment with no DOM. */
const readFlag = (): boolean =>
  typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';

const writeFlag = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
};

const clearFlag = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
};

/**
 * Whether the user is done with the tour for good — same check `start` makes.
 *
 * Exported so callers can decide *before* a step list exists whether the tour
 * is still in play. Used to avoid nudging a user who already opted out.
 */
export const isOnboardingDismissed = (): boolean => readFlag();

/**
 * A tour only counts as done once the user stood on the connect step AND has
 * actually connected at least once.
 *
 * Someone who never pressed "Activate Free" gets no connect step at all, and
 * would otherwise be marked done forever after a couple of dashboard steps —
 * losing exactly the user this tour exists for. They see it again next visit.
 *
 * The traffic check exists for the same reason one step further along: clicking
 * through to the last step is not the same as switching the VPN on. A user who
 * reaches the end without ever connecting gets the tour again on their next
 * visit — deliberately, because they have not done the thing the tour exists
 * for. Once they do connect — on this device or another — `start()`'s own
 * `hasEverConnected` check (below) stops the tour from starting at all,
 * persisted flag or not.
 *
 * This deliberately checks the *current* step rather than merely whether a
 * connect step exists in the list. It is not sufficient on its own, though: the
 * engine silently advances past a step whose target never appears, so a page
 * that failed to render the connect block would still land here. That path is
 * closed separately by `abort()`.
 */
export function shouldPersistCompletion(
  steps: OnboardingStep[],
  stepIndex: number,
  hasEverConnected: boolean,
): boolean {
  return steps[stepIndex]?.target === ANCHOR_CONNECT && hasEverConnected;
}

interface OnboardingState {
  steps: OnboardingStep[];
  stepIndex: number;
  isRunning: boolean;
  /**
   * Whether `start` already fired in this browser session. Dashboard re-publishes
   * the step list whenever subscription state changes, so without this guard
   * activating the trial would call `start` again and throw the user back to
   * step one — or relaunch a tour they just finished.
   */
  hasStarted: boolean;
  /**
   * Whether any of the user's subscriptions has ever carried traffic. Published
   * by Dashboard alongside the step list; gates `complete()` and, below,
   * `start()` itself.
   */
  hasEverConnected: boolean;
  /**
   * One-shot override set by `reset()`. Consumed by the very next `start()`
   * call to skip both the persisted-flag check and the `hasEverConnected`
   * check — otherwise the `?tour=1` support link would silently do nothing
   * for exactly the connected users it exists to reach.
   */
  forceNextStart: boolean;
  /**
   * The tour was stopped by the 10s escape hatch on a step that was WAITING on
   * the user (activate a trial), not by an explicit "skip" or a real finish.
   * Such a stop is not a real end: if the user then performs the action, the
   * republished (different) step list re-opens the tour. Set by `complete()`
   * for that case only; cleared by `start`/`skip`/`reset` and once consumed.
   */
  canResume: boolean;

  /**
   * Begins the tour unless it was already completed, the user is already
   * connected, or there is nothing to show — unless `reset()` just asked for
   * it anyway via `forceNextStart`.
   */
  start: (steps: OnboardingStep[]) => void;
  /** Replaces the step list mid-tour when the underlying state changes. */
  setSteps: (steps: OnboardingStep[]) => void;
  setHasEverConnected: (hasEverConnected: boolean) => void;
  next: () => void;
  prev: () => void;
  /**
   * Jumps straight to a step. Used when the user follows a step's instruction
   * and navigates themselves — the tour meets them where they landed instead of
   * waiting on the page they left.
   */
  goTo: (index: number) => void;
  /**
   * The user closed the tour early, from the visible button or Escape. Does
   * not persist — same as walking away without finishing, so the tour comes
   * back next visit unless they've connected by then. `complete()` on the
   * connect step is the only path that marks the tour done for good.
   */
  skip: () => void;
  /**
   * Forgets that the tour was ever finished, so it runs again — and arms
   * `forceNextStart` so the very next `start()` also ignores
   * `hasEverConnected`. Without that, this would be a no-op for exactly the
   * users `?tour=1` is for: someone already connected, asking to see the
   * tour again.
   *
   * Completion lives in this browser's storage, not on the account — there is
   * no server-side switch to flip. Support and testing need a way back in
   * without walking someone through devtools, which is what `?tour=1` calls.
   */
  reset: () => void;
  /** Reached the end of the list; persists only per `shouldPersistCompletion`. */
  complete: () => void;
  /**
   * The engine gave up: a step's target never appeared in the DOM. Ends the tour
   * WITHOUT persisting, so the user gets it again next visit.
   *
   * This is the difference between "the user was walked to the end" and "we ran
   * out of things to point at".
   */
  abort: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  steps: [],
  stepIndex: 0,
  isRunning: false,
  hasStarted: false,
  hasEverConnected: false,
  forceNextStart: false,
  canResume: false,

  start: (steps) => {
    if (get().hasStarted) return;
    const force = get().forceNextStart;
    if (force) set({ forceNextStart: false });
    if (!force && readFlag()) return;
    if (!force && get().hasEverConnected) return;
    if (!steps.length) return;
    set({ steps, stepIndex: 0, isRunning: true, hasStarted: true, canResume: false });
  },

  setSteps: (steps) => {
    const state = get();
    if (!state.isRunning) {
      // Re-open a tour that the escape hatch stopped (canResume) once the
      // user's action republishes a DIFFERENT step list — e.g. the trial step
      // stops the tour, then activating the trial swaps in the subscription
      // steps. A same-content republish (another query landing) must not
      // resume, and a persisted/skipped tour never does.
      const changed =
        steps.map((s) => s.target).join('|') !== state.steps.map((s) => s.target).join('|');
      if (state.canResume && !readFlag() && steps.length > 0 && changed) {
        set({
          steps,
          stepIndex: Math.min(state.stepIndex, Math.max(0, steps.length - 1)),
          isRunning: true,
          canResume: false,
        });
      }
      return;
    }
    set({
      steps,
      stepIndex: Math.min(state.stepIndex, Math.max(0, steps.length - 1)),
    });
  },

  setHasEverConnected: (hasEverConnected) => set({ hasEverConnected }),

  next: () =>
    set((state) => ({
      stepIndex: Math.min(state.stepIndex + 1, Math.max(0, state.steps.length - 1)),
    })),

  prev: () => set((state) => ({ stepIndex: Math.max(0, state.stepIndex - 1) })),

  goTo: (index) =>
    set((state) => ({
      stepIndex: Math.max(0, Math.min(index, Math.max(0, state.steps.length - 1))),
    })),

  skip: () => {
    // Explicit opt-out ("Пройти в другой раз"/Escape): the user wants out, so
    // it must NOT resume even if they later activate a trial.
    set({ isRunning: false, canResume: false });
  },

  reset: () => {
    clearFlag();
    set({
      steps: [],
      stepIndex: 0,
      isRunning: false,
      hasStarted: false,
      forceNextStart: true,
      canResume: false,
    });
  },

  complete: () => {
    const { steps, stepIndex, hasEverConnected } = get();
    const persist = shouldPersistCompletion(steps, stepIndex, hasEverConnected);
    if (persist) writeFlag();
    // A non-persisted "complete" fired from a step that was waiting on the user
    // (the 10s escape on "activate a trial") is not a real finish — arm resume
    // so performing the action re-opens the tour. A real end (connect step,
    // persisted) or any non-action step does not.
    const canResume = !persist && Boolean(steps[stepIndex]?.awaitsUserAction);
    set({ isRunning: false, canResume });
  },

  abort: () => set({ isRunning: false }),
}));
