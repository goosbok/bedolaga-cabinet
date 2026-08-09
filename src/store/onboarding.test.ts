import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEY, shouldPersistCompletion, useOnboardingStore } from './onboarding';
import type { OnboardingStep } from '../components/Onboarding';

const step = (target: string, route?: string): OnboardingStep => ({
  target,
  title: target,
  description: target,
  placement: 'bottom',
  route,
});

const fullTour = [step('welcome'), step('connect-devices'), step('install-connect', '/connection')];
const shortTour = [step('welcome'), step('trial-card')];

// vitest runs in the `node` environment here, so localStorage has to be supplied.
beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => {
      backing.clear();
    },
  });
  useOnboardingStore.setState({ steps: [], stepIndex: 0, isRunning: false, hasStarted: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldPersistCompletion', () => {
  it('persists when the user is standing on the closing connect step', () => {
    expect(shouldPersistCompletion(fullTour, 2)).toBe(true);
  });

  it('does not persist when the tour ended before the connect step', () => {
    expect(shouldPersistCompletion(shortTour, 1)).toBe(false);
  });

  it('does not persist when the connect step exists but was not reached', () => {
    expect(shouldPersistCompletion(fullTour, 1)).toBe(false);
  });

  it('does not persist for an empty tour', () => {
    expect(shouldPersistCompletion([], 0)).toBe(false);
  });
});

describe('useOnboardingStore', () => {
  it('starts a tour at the first step', () => {
    useOnboardingStore.getState().start(fullTour);
    expect(useOnboardingStore.getState().isRunning).toBe(true);
    expect(useOnboardingStore.getState().stepIndex).toBe(0);
  });

  it('does not start when the flag is already set', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    useOnboardingStore.getState().start(fullTour);
    expect(useOnboardingStore.getState().isRunning).toBe(false);
  });

  it('does not start with an empty step list', () => {
    useOnboardingStore.getState().start([]);
    expect(useOnboardingStore.getState().isRunning).toBe(false);
  });

  it('does not rewind a running tour when start is called again', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    // Dashboard re-publishes a new step list every time subscription state
    // changes; a second start must not throw the user back to step one.
    s.start([...fullTour]);
    expect(useOnboardingStore.getState().stepIndex).toBe(1);
  });

  it('does not restart in the same session after the tour ended unpersisted', () => {
    const s = useOnboardingStore.getState();
    s.start(shortTour);
    s.complete();
    s.start(shortTour);
    expect(useOnboardingStore.getState().isRunning).toBe(false);
  });

  it('moves forward and backward without leaving the range', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    expect(useOnboardingStore.getState().stepIndex).toBe(1);
    s.prev();
    s.prev();
    expect(useOnboardingStore.getState().stepIndex).toBe(0);
  });

  it('skip always sets the persisted flag', () => {
    const s = useOnboardingStore.getState();
    s.start(shortTour);
    s.skip();
    expect(useOnboardingStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
  });

  it('complete sets the flag when the user finished on the connect step', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    s.next();
    s.complete();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
  });

  it('complete leaves the flag unset when the user never got a connect step', () => {
    const s = useOnboardingStore.getState();
    s.start(shortTour);
    s.complete();
    expect(useOnboardingStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  });

  it('setSteps replaces the list while running and clamps the index', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    s.next();
    s.setSteps([step('welcome')]);
    expect(useOnboardingStore.getState().steps).toHaveLength(1);
    expect(useOnboardingStore.getState().stepIndex).toBe(0);
  });

  it('setSteps is ignored when the tour is not running', () => {
    useOnboardingStore.getState().setSteps(fullTour);
    expect(useOnboardingStore.getState().steps).toHaveLength(0);
  });

  it('abort ends the tour without persisting, even on the connect step', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    s.next();
    // Standing on the connect step, but its target never rendered.
    s.abort();
    expect(useOnboardingStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  });
});
