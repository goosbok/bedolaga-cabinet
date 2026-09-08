# Onboarding Tour: Soft Skip Button + Start Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible, non-permanent "skip" button to the onboarding tour, and stop the tour from starting at all for users who are already connected — even on a browser/device that has never run it before.

**Architecture:** All logic lives in the existing Zustand store `src/store/onboarding.ts` (single source of truth for tour state) and two of its consumers: `src/components/Onboarding.tsx` (the tooltip UI) and `src/pages/Dashboard.tsx` (publishes step lists and the `hasEverConnected` signal, and decides when to call `start()`). No new files, no new API calls — `hasEverConnected` is already computed from data Dashboard already fetches.

**Tech Stack:** React, Zustand, TypeScript, Vitest (store logic only — this codebase has no component-test harness; see Task 5), i18next, Biome.

**Spec:** `docs/superpowers/specs/2026-09-08-onboarding-tour-skip-button-design.md`

**One design refinement made while planning (not in the original spec):** `reset()` — the handler behind the `?tour=1` support/testing link — must force the *next* `start()` call to bypass the new `hasEverConnected` gate. Without this, `?tour=1` would silently stop working for exactly the users support most needs it for: someone already connected, asking to see the tour again. This is implemented via a one-shot `forceNextStart` flag on the store, consumed and cleared by the next `start()`.

---

### Task 1: Store — `skip()` stops persisting the tour as done

**Files:**
- Modify: `src/store/onboarding.ts`
- Test: `src/store/onboarding.test.ts`

- [ ] **Step 1: Update the tests that assert the old (permanent) skip behavior**

In `src/store/onboarding.test.ts`, replace this test:

```ts
  it('skip always sets the persisted flag', () => {
    const s = useOnboardingStore.getState();
    s.start(shortTour);
    s.skip();
    expect(useOnboardingStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
  });

  it('skip persists even on the connect step when the user never connected', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    s.next();
    s.skip();
    // An explicit opt-out stays an opt-out, connected or not.
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
  });
```

with:

```ts
  it('skip does not persist — the tour is not marked done', () => {
    const s = useOnboardingStore.getState();
    s.start(shortTour);
    s.skip();
    expect(useOnboardingStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  });

  it('skip does not persist even on the connect step when the user never connected', () => {
    const s = useOnboardingStore.getState();
    s.start(fullTour);
    s.next();
    s.next();
    s.skip();
    // Leaving early is leaving early, connect step or not — only actually
    // connecting marks the tour done for good.
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  });
```

Then, inside the `describe('isOnboardingDismissed', ...)` block, replace:

```ts
    it('is true once the user skipped', () => {
      useOnboardingStore.getState().start(shortTour);
      useOnboardingStore.getState().skip();
      expect(isOnboardingDismissed()).toBe(true);
    });
```

with:

```ts
    it('stays false after the user skips — skip is not permanent', () => {
      useOnboardingStore.getState().start(shortTour);
      useOnboardingStore.getState().skip();
      expect(isOnboardingDismissed()).toBe(false);
    });
```

Then replace the `reset() lets a finished tour run again` test's setup, which currently dismisses via `skip()` (no longer possible — skip doesn't persist). Replace:

```ts
    it('reset() lets a finished tour run again', () => {
      const s = useOnboardingStore.getState();
      s.start(shortTour);
      s.skip();
      expect(isOnboardingDismissed()).toBe(true);

      useOnboardingStore.getState().reset();

      expect(isOnboardingDismissed()).toBe(false);
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
      // hasStarted has to fall too, or start() refuses on the guard instead.
      expect(useOnboardingStore.getState().hasStarted).toBe(false);

      useOnboardingStore.getState().start(fullTour);
      expect(useOnboardingStore.getState().isRunning).toBe(true);
      expect(useOnboardingStore.getState().stepIndex).toBe(0);
    });
```

with:

```ts
    it('reset() lets a finished tour run again', () => {
      const s = useOnboardingStore.getState();
      // Only a real completion persists the flag now — skip() no longer does.
      s.setHasEverConnected(true);
      s.start(fullTour);
      s.next();
      s.next();
      s.complete();
      expect(isOnboardingDismissed()).toBe(true);

      useOnboardingStore.getState().reset();

      expect(isOnboardingDismissed()).toBe(false);
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
      // hasStarted has to fall too, or start() refuses on the guard instead.
      expect(useOnboardingStore.getState().hasStarted).toBe(false);

      useOnboardingStore.getState().start(fullTour);
      expect(useOnboardingStore.getState().isRunning).toBe(true);
      expect(useOnboardingStore.getState().stepIndex).toBe(0);
    });
```

Finally, replace the `agrees with start(): dismissed means start is a no-op` test's setup the same way, and explicitly clear `hasEverConnected` afterward so this test still isolates the *persisted-flag* path (Task 2 adds a dedicated test for the `hasEverConnected` path — this test must not silently start passing for that reason instead). Replace:

```ts
    it('agrees with start(): dismissed means start is a no-op', () => {
      useOnboardingStore.getState().start(shortTour);
      useOnboardingStore.getState().skip();
      useOnboardingStore.setState({ hasStarted: false, steps: [], isRunning: false });

      expect(isOnboardingDismissed()).toBe(true);
      useOnboardingStore.getState().start(fullTour);
      expect(useOnboardingStore.getState().isRunning).toBe(false);
    });
```

with:

```ts
    it('agrees with start(): dismissed means start is a no-op', () => {
      const s = useOnboardingStore.getState();
      s.setHasEverConnected(true);
      s.start(fullTour);
      s.next();
      s.next();
      s.complete();
      useOnboardingStore.setState({
        hasStarted: false,
        steps: [],
        isRunning: false,
        // Isolate the persisted-flag path from the separate hasEverConnected
        // gate Task 2 adds — this test is specifically about the flag.
        hasEverConnected: false,
      });

      expect(isOnboardingDismissed()).toBe(true);
      useOnboardingStore.getState().start(fullTour);
      expect(useOnboardingStore.getState().isRunning).toBe(false);
    });
```

- [ ] **Step 2: Run the tests to see the new/changed ones fail**

Run: `npm test -- src/store/onboarding.test.ts`
Expected: FAIL — the assertions above expect `null`/`false` where `skip()` currently writes `'true'`/returns `true`.

- [ ] **Step 3: Make `skip()` stop persisting**

In `src/store/onboarding.ts`, replace:

```ts
  skip: () => {
    writeFlag();
    set({ isRunning: false });
  },
```

with:

```ts
  skip: () => {
    set({ isRunning: false });
  },
```

- [ ] **Step 4: Update the doc comments that describe the old contract**

Replace the `skip` field's doc comment in the `OnboardingState` interface:

```ts
  /** Explicit opt-out: never show the tour again. */
  skip: () => void;
```

with:

```ts
  /**
   * The user closed the tour early, from the visible button or Escape. Does
   * not persist — same as walking away without finishing, so the tour comes
   * back next visit unless they've connected by then. `complete()` on the
   * connect step is the only path that marks the tour done for good.
   */
  skip: () => void;
```

Replace the two sentences in `shouldPersistCompletion`'s doc comment that call "Skip" a permanent opt-out. Replace:

```
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
```

with:

```
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
```

Also update the comment inside the test file at the `shouldPersistCompletion` describe block. In `src/store/onboarding.test.ts`, replace:

```ts
  it('does not persist on the connect step when the user never connected', () => {
    // Clicking to the end of the tour is not the same as switching the VPN on:
    // this user gets the tour again, and "Skip" is their way out.
    expect(shouldPersistCompletion(fullTour, 2, false)).toBe(false);
  });
```

with:

```ts
  it('does not persist on the connect step when the user never connected', () => {
    // Clicking to the end of the tour is not the same as switching the VPN on:
    // this user gets the tour again next visit, same as if they had skipped
    // early. The only door out for good is actually connecting.
    expect(shouldPersistCompletion(fullTour, 2, false)).toBe(false);
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/store/onboarding.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Commit**

```bash
git add src/store/onboarding.ts src/store/onboarding.test.ts
git commit -m "fix(onboarding): stop skip from persisting the tour as done"
```

---

### Task 2: Store — don't start the tour for an already-connected user; keep `?tour=1` working anyway

**Files:**
- Modify: `src/store/onboarding.ts`
- Test: `src/store/onboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these to the `describe('useOnboardingStore', ...)` block in `src/store/onboarding.test.ts` (anywhere after the existing `start` tests reads well, e.g. right after the `'does not start with an empty step list'` test):

```ts
  it('does not start when the user already has a live connection', () => {
    const s = useOnboardingStore.getState();
    s.setHasEverConnected(true);
    s.start(fullTour);
    expect(useOnboardingStore.getState().isRunning).toBe(false);
  });

  it('reset() forces the next start even for a connected user — the ?tour=1 override', () => {
    const s = useOnboardingStore.getState();
    s.setHasEverConnected(true);
    s.reset();
    s.start(fullTour);
    expect(useOnboardingStore.getState().isRunning).toBe(true);
  });

  it('the reset() override is consumed by that one start and does not linger', () => {
    const s = useOnboardingStore.getState();
    s.reset();
    s.start(shortTour);
    s.complete();
    useOnboardingStore.setState({ hasStarted: false, isRunning: false, steps: [] });
    s.setHasEverConnected(true);
    s.start(fullTour);
    // Second start is a normal one — the override from reset() was one-shot.
    expect(useOnboardingStore.getState().isRunning).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/store/onboarding.test.ts`
Expected: FAIL — all three new tests, because `start()` does not check `hasEverConnected` yet and `reset()` has no override to give it.

- [ ] **Step 3: Add the `forceNextStart` field and wire it into `start()`/`reset()`**

In `src/store/onboarding.ts`, in the `OnboardingState` interface, add a new field right after `hasEverConnected`:

```ts
  /**
   * Whether any of the user's subscriptions has ever carried traffic. Published
   * by Dashboard alongside the step list; gates `complete()`.
   */
  hasEverConnected: boolean;
```

becomes:

```ts
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
```

Update the `start` doc comment:

```ts
  /** Begins the tour unless it was already completed or there is nothing to show. */
  start: (steps: OnboardingStep[]) => void;
```

becomes:

```ts
  /**
   * Begins the tour unless it was already completed, the user is already
   * connected, or there is nothing to show — unless `reset()` just asked for
   * it anyway via `forceNextStart`.
   */
  start: (steps: OnboardingStep[]) => void;
```

Update the `reset` doc comment:

```ts
  /**
   * Forgets that the tour was ever finished or skipped, so it runs again.
   *
   * Completion lives in this browser's storage, not on the account — there is
   * no server-side switch to flip. Support and testing need a way back in
   * without walking someone through devtools, which is what `?tour=1` calls.
   */
  reset: () => void;
```

becomes:

```ts
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
```

Now update the store implementation. Replace:

```ts
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
```

with:

```ts
export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  steps: [],
  stepIndex: 0,
  isRunning: false,
  hasStarted: false,
  hasEverConnected: false,
  forceNextStart: false,

  start: (steps) => {
    if (get().hasStarted) return;
    const force = get().forceNextStart;
    if (!force && readFlag()) return;
    if (!force && get().hasEverConnected) return;
    if (!steps.length) return;
    set({ steps, stepIndex: 0, isRunning: true, hasStarted: true, forceNextStart: false });
  },
```

And replace:

```ts
  reset: () => {
    clearFlag();
    set({ steps: [], stepIndex: 0, isRunning: false, hasStarted: false });
  },
```

with:

```ts
  reset: () => {
    clearFlag();
    set({ steps: [], stepIndex: 0, isRunning: false, hasStarted: false, forceNextStart: true });
  },
```

- [ ] **Step 4: Reset `forceNextStart` in the test file's `beforeEach` too**

In `src/store/onboarding.test.ts`, the `beforeEach` re-seeds store state between tests. Replace:

```ts
  useOnboardingStore.setState({
    steps: [],
    stepIndex: 0,
    isRunning: false,
    hasStarted: false,
    hasEverConnected: false,
  });
```

with:

```ts
  useOnboardingStore.setState({
    steps: [],
    stepIndex: 0,
    isRunning: false,
    hasStarted: false,
    hasEverConnected: false,
    forceNextStart: false,
  });
```

(`setState` merges by default — without this, `forceNextStart` could leak `true` from one test into the next.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/store/onboarding.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones and everything from Task 1)

- [ ] **Step 6: Commit**

```bash
git add src/store/onboarding.ts src/store/onboarding.test.ts
git commit -m "fix(onboarding): don't start the tour for an already-connected user"
```

---

### Task 3: Visible skip button in the tooltip, with softened copy in all locales

**Files:**
- Modify: `src/components/Onboarding.tsx`
- Modify: `src/locales/ru.json`, `src/locales/en.json`, `src/locales/zh.json`, `src/locales/fa.json`

No test file — this codebase has no component-test harness (see Task 5 for why that's not being introduced here). Verify with `npm run type-check` and a manual look (Task 5's last step).

- [ ] **Step 1: Add the button and update the stale comment**

In `src/components/Onboarding.tsx`, replace:

```tsx
        {/* Actions. No visible "skip": the tour is short and only ever shown to
            someone who has not connected yet, so the product choice is to keep
            guiding rather than offer an exit on every step. Escape still ends it
            for keyboard users. */}
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            {showNext && (
              <button onClick={handleNext} className="btn-primary px-4 py-1.5 text-sm">
                {currentStep === steps.length - 1
                  ? t('onboarding.finish', 'Finish')
                  : t('common.next', 'Next')}
              </button>
            )}
          </div>
        </div>
```

with:

```tsx
        {/* Actions. Skip is visible on every step, including one that hides
            "Next" while it waits on the user — it only makes visible the exit
            Escape already provides, it does not add a new one. Neither this
            button nor Escape mark the tour done: closing early just brings it
            back next visit, same as walking away without finishing. */}
        <div className="flex items-center justify-between">
          <button onClick={onSkip} className="btn-ghost px-4 py-1.5 text-sm">
            {t('onboarding.skip', 'Do it later')}
          </button>
          <div className="flex gap-2">
            {showNext && (
              <button onClick={handleNext} className="btn-primary px-4 py-1.5 text-sm">
                {currentStep === steps.length - 1
                  ? t('onboarding.finish', 'Finish')
                  : t('common.next', 'Next')}
              </button>
            )}
          </div>
        </div>
```

- [ ] **Step 2: Update the translation copy in all four locales**

In `src/locales/ru.json`, find (around line 5654):

```json
    "skip": "Пропустить",
```

replace with:

```json
    "skip": "Пройти в другой раз",
```

In `src/locales/en.json`, find (around line 5108):

```json
    "skip": "Skip",
```

replace with:

```json
    "skip": "Do it later",
```

In `src/locales/zh.json`, find (around line 4541):

```json
    "skip": "跳过",
```

replace with:

```json
    "skip": "稍后再看",
```

In `src/locales/fa.json`, find (around line 4542):

```json
    "skip": "رد کردن",
```

replace with:

```json
    "skip": "بعداً انجام می‌دهم",
```

(Line numbers are approximate — search for the `"skip"` key inside each file's `"onboarding"` block specifically; there may be unrelated `"skip"` keys elsewhere in the file. The zh/fa translations are best-effort, not reviewed by a native speaker — flag this to the user after implementation so they can sanity-check those two strings specifically.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors (JSON edits don't affect types, but this also catches any typo in the `Onboarding.tsx` edit)

- [ ] **Step 4: Commit**

```bash
git add src/components/Onboarding.tsx src/locales/ru.json src/locales/en.json src/locales/zh.json src/locales/fa.json
git commit -m "feat(onboarding): add a visible skip button to the tour"
```

---

### Task 4: Dashboard — wait for the multi-tariff subscriptions list before starting the tour

**Files:**
- Modify: `src/pages/Dashboard.tsx`

No test file — same reasoning as Task 3; this is a data-loading gate on a React component, and the codebase has no component-test harness. Verify with `npm run type-check` and the manual check in Task 5.

- [ ] **Step 1: Capture the subscriptions-list query's loading state**

In `src/pages/Dashboard.tsx`, replace:

```tsx
  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
```

with:

```tsx
  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData, isLoading: multiSubLoading } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
```

- [ ] **Step 2: Gate the tour start-timer on it**

Still in `src/pages/Dashboard.tsx`, replace:

```tsx
  useEffect(() => {
    if (subLoading || refLoading || blockingType) return;
    if (startTimerRef.current !== null) return;
    startTimerRef.current = window.setTimeout(
      () => startOnboarding(onboardingStepsRef.current),
      500,
    );
  }, [subLoading, refLoading, blockingType, startOnboarding]);
```

with:

```tsx
  useEffect(() => {
    // multiSubLoading matters here too: in multi-tariff mode hasEverConnected
    // (read by the store's start()) comes from multiSubData, and subLoading
    // alone doesn't cover it — that query is disabled entirely in multi-tariff
    // mode. Without this, start() could fire before hasEverConnected settled.
    if (subLoading || multiSubLoading || refLoading || blockingType) return;
    if (startTimerRef.current !== null) return;
    startTimerRef.current = window.setTimeout(
      () => startOnboarding(onboardingStepsRef.current),
      500,
    );
  }, [subLoading, multiSubLoading, refLoading, blockingType, startOnboarding]);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(onboarding): wait for the subscriptions list before starting the tour"
```

---

### Task 5: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, no failures (includes every test touched in Tasks 1–2 plus the pre-existing suite, e.g. `dashboardTour.test.ts`, `onboardingBlockers.test.ts`)

- [ ] **Step 2: Type-check the whole project**

Run: `npm run type-check`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors. If Biome flags something in the touched files, fix it and re-run before moving on.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: builds successfully (this also re-runs `tsc`, per the `build` script)

- [ ] **Step 5: Report what could not be automatically verified**

This codebase has no component-test harness and no jsdom (`vitest.config.ts` runs `environment: 'node'`), so nothing above actually renders `Onboarding.tsx` or `Dashboard.tsx`. Two things need an eyes-on check that this plan cannot do by itself, and should be called out to the user rather than silently skipped:

1. **Visual check of the new skip button** — does "Пройти в другой раз" next to "Далее"/"Готово" fit inside the 320px-wide tooltip without wrapping awkwardly on a narrow (mobile) viewport? Needs the dev server against a real backend (per project memory: SSH tunnel to the master, `ssh -N -L 8099:127.0.0.1:8081 -p 2222 root@178.104.70.132`, plus a temporary local `vite.config.ts` port change 8080→8099 — not to be committed) and an account whose tour actually renders.
2. **End-to-end behavior check on staging** (`max-vpn.online:8443` — shares the prod backend/DB): an account with real historical traffic should not see the tour at all; a fresh account should see the new button, and using it should bring the tour back on the next page load without connecting.

- [ ] **Step 6: No commit for this task** — verification only, nothing to stage.
