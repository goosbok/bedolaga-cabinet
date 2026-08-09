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

/**
 * A tour only counts as done once the user stood on the connect step AND has
 * actually connected at least once.
 *
 * Someone who never pressed "Activate Free" gets no connect step at all, and
 * would otherwise be marked done forever after a couple of dashboard steps —
 * losing exactly the user this tour exists for. They see it again next visit;
 * "Skip" is how they opt out for good.
 *
 * The traffic check exists for the same reason one step further along: clicking
 * through to the last step is not the same as switching the VPN on. A user who
 * reaches the end without ever connecting gets the tour again on their next
 * visit — deliberately, because they have not done the thing the tour exists
 * for. "Skip" remains their way out.
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
   * by Dashboard alongside the step list; gates `complete()`.
   */
  hasEverConnected: boolean;

  /** Begins the tour unless it was already completed or there is nothing to show. */
  start: (steps: OnboardingStep[]) => void;
  /** Replaces the step list mid-tour when the underlying state changes. */
  setSteps: (steps: OnboardingStep[]) => void;
  setHasEverConnected: (hasEverConnected: boolean) => void;
  next: () => void;
  prev: () => void;
  /** Explicit opt-out: never show the tour again. */
  skip: () => void;
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

  start: (steps) => {
    if (get().hasStarted) return;
    if (readFlag()) return;
    if (!steps.length) return;
    set({ steps, stepIndex: 0, isRunning: true, hasStarted: true });
  },

  setSteps: (steps) => {
    if (!get().isRunning) return;
    set((state) => ({
      steps,
      stepIndex: Math.min(state.stepIndex, Math.max(0, steps.length - 1)),
    }));
  },

  setHasEverConnected: (hasEverConnected) => set({ hasEverConnected }),

  next: () =>
    set((state) => ({
      stepIndex: Math.min(state.stepIndex + 1, Math.max(0, state.steps.length - 1)),
    })),

  prev: () => set((state) => ({ stepIndex: Math.max(0, state.stepIndex - 1) })),

  skip: () => {
    writeFlag();
    set({ isRunning: false });
  },

  complete: () => {
    const { steps, stepIndex, hasEverConnected } = get();
    if (shouldPersistCompletion(steps, stepIndex, hasEverConnected)) writeFlag();
    set({ isRunning: false });
  },

  abort: () => set({ isRunning: false }),
}));
